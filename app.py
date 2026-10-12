"""Esports Tournament Management System - Flask + SQLite."""
import os
import sqlite3
from datetime import date
from functools import wraps

from flask import (Flask, abort, flash, g, jsonify, redirect, render_template,
                   request, send_from_directory, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-me-in-production")
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "esports.db"))

WIN_POINTS, DRAW_POINTS = 3, 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('player', 'organizer', 'admin')),
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tournaments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    game         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    start_date   TEXT NOT NULL,
    max_players  INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'ongoing', 'completed')),
    organizer_id INTEGER NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS enrollments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    UNIQUE (tournament_id, user_id)
);
CREATE TABLE IF NOT EXISTS matches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round         INTEGER NOT NULL,
    player1_id    INTEGER NOT NULL REFERENCES users(id),
    player2_id    INTEGER NOT NULL REFERENCES users(id),
    score1        INTEGER,
    score2        INTEGER,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'played'))
);
"""


# ---------------------------------------------------------------- database
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.executescript(SCHEMA)


def query(sql, args=()):
    return get_db().execute(sql, args).fetchall()


def query_one(sql, args=()):
    return get_db().execute(sql, args).fetchone()


def execute(sql, args=()):
    db = get_db()
    cur = db.execute(sql, args)
    db.commit()
    return cur


# ----------------------------------------------------------- business logic
def build_table(players, matches):
    """Calculate points and rankings from played matches."""
    rows = {
        p["id"]: dict(id=p["id"], username=p["username"], played=0, wins=0,
                      draws=0, losses=0, points=0, gf=0, ga=0)
        for p in players
    }
    for m in matches:
        a, b = rows.get(m["player1_id"]), rows.get(m["player2_id"])
        if a is None or b is None:
            continue
        a["played"] += 1
        b["played"] += 1
        a["gf"] += m["score1"]; a["ga"] += m["score2"]
        b["gf"] += m["score2"]; b["ga"] += m["score1"]
        if m["score1"] > m["score2"]:
            a["wins"] += 1; b["losses"] += 1; a["points"] += WIN_POINTS
        elif m["score1"] < m["score2"]:
            b["wins"] += 1; a["losses"] += 1; b["points"] += WIN_POINTS
        else:
            a["draws"] += 1; b["draws"] += 1
            a["points"] += DRAW_POINTS; b["points"] += DRAW_POINTS
    table = sorted(rows.values(),
                   key=lambda r: (-r["points"], -r["wins"], -(r["gf"] - r["ga"]),
                                  r["username"].lower()))
    for i, r in enumerate(table, start=1):
        r["rank"] = i
        r["diff"] = r["gf"] - r["ga"]
    return table


def tournament_table(tournament_id):
    players = query("""SELECT u.id, u.username FROM enrollments e
                       JOIN users u ON u.id = e.user_id
                       WHERE e.tournament_id = ?""", (tournament_id,))
    matches = query("SELECT * FROM matches WHERE tournament_id = ? AND status = 'played'",
                    (tournament_id,))
    return build_table(players, matches)


def global_table():
    players = query("SELECT id, username FROM users WHERE role = 'player'")
    matches = query("SELECT * FROM matches WHERE status = 'played'")
    return build_table(players, matches)


def round_robin(player_ids):
    """Circle method: every player meets every other player once."""
    ids = list(player_ids)
    if len(ids) % 2:
        ids.append(None)  # bye
    n = len(ids)
    rounds = []
    for _ in range(n - 1):
        pairs = []
        for i in range(n // 2):
            a, b = ids[i], ids[n - 1 - i]
            if a is not None and b is not None:
                pairs.append((a, b))
        rounds.append(pairs)
        ids = [ids[0]] + [ids[-1]] + ids[1:-1]
    return rounds


# ------------------------------------------------------------------- auth
@app.before_request
def load_user():
    uid = session.get("user_id")
    g.user = query_one("SELECT * FROM users WHERE id = ?", (uid,)) if uid else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            flash("Log in to continue.", "error")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def organizer_required(view):
    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if g.user["role"] not in ("organizer", "admin"):
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def get_owned_tournament(tournament_id):
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    if t is None:
        abort(404)
    if g.user["role"] != "admin" and t["organizer_id"] != g.user["id"]:
        abort(403)
    return t


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        role = request.form.get("role", "player")
        error = None
        if not 3 <= len(username) <= 20:
            error = "Username must be 3 to 20 characters."
        elif "@" not in email:
            error = "Enter a valid email address."
        elif len(password) < 6:
            error = "Password must be at least 6 characters."
        elif role not in ("player", "organizer", "admin"):
            error = "Choose a role."
        elif query_one("SELECT 1 FROM users WHERE username = ? OR email = ?", (username, email)):
            error = "That username or email is already registered."
        if error:
            flash(error, "error")
        else:
            cur = execute("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
                          (username, email, generate_password_hash(password), role))
            session.clear()
            session["user_id"] = cur.lastrowid
            flash(f"Welcome, {username}.", "ok")
            return redirect(url_for("tournaments"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        ident = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = query_one("SELECT * FROM users WHERE username = ? OR email = ?", (ident, ident.lower()))
        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            nxt = request.args.get("next", "")
            return redirect(nxt if nxt.startswith("/") and not nxt.startswith("//") else url_for("tournaments"))
        flash("Username or password is incorrect.", "error")
    return render_template("login.html")


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


DIST_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")

# ---------------------------------------------------------------- pages
@app.route("/")
def home():
    if os.path.exists(os.path.join(DIST_DIR, "index.html")):
        return send_from_directory(DIST_DIR, "index.html")
    top = [r for r in global_table() if r["played"] > 0][:5]
    open_tournaments = query("""
        SELECT t.*, (SELECT COUNT(*) FROM enrollments e WHERE e.tournament_id = t.id) AS players
        FROM tournaments t WHERE t.status = 'open' ORDER BY t.start_date LIMIT 4""")
    return render_template("home.html", top=top, open_tournaments=open_tournaments)


@app.route("/assets/<path:filename>")
def serve_dist_assets(filename):
    return send_from_directory(os.path.join(DIST_DIR, "assets"), filename)


@app.route("/hero-banner.jpg")
def serve_hero_banner():
    return send_from_directory(DIST_DIR, "hero-banner.jpg")


@app.route("/classic")
def classic_home():
    top = [r for r in global_table() if r["played"] > 0][:5]
    open_tournaments = query("""
        SELECT t.*, (SELECT COUNT(*) FROM enrollments e WHERE e.tournament_id = t.id) AS players
        FROM tournaments t WHERE t.status = 'open' ORDER BY t.start_date LIMIT 4""")
    return render_template("home.html", top=top, open_tournaments=open_tournaments)


@app.route("/tournaments")
def tournaments():
    rows = query("""
        SELECT t.*, u.username AS organizer,
               (SELECT COUNT(*) FROM enrollments e WHERE e.tournament_id = t.id) AS players
        FROM tournaments t JOIN users u ON u.id = t.organizer_id
        ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'ongoing' THEN 1 ELSE 2 END, t.start_date""")
    return render_template("tournaments.html", tournaments=rows)


@app.route("/tournaments/new", methods=["GET", "POST"])
@organizer_required
def create_tournament():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        game = request.form.get("game", "").strip()
        description = request.form.get("description", "").strip()
        start_date = request.form.get("start_date", "")
        try:
            max_players = int(request.form.get("max_players", "0"))
            date.fromisoformat(start_date)
        except ValueError:
            max_players, start_date = 0, ""
        if not name or not game:
            flash("Tournament name and game are required.", "error")
        elif not start_date:
            flash("Enter a valid start date.", "error")
        elif not 2 <= max_players <= 64:
            flash("Max players must be between 2 and 64.", "error")
        else:
            cur = execute("""INSERT INTO tournaments (name, game, description, start_date, max_players, organizer_id)
                             VALUES (?, ?, ?, ?, ?, ?)""",
                          (name, game, description, start_date, max_players, g.user["id"]))
            flash("Tournament created. Players can enroll now.", "ok")
            return redirect(url_for("tournament", tournament_id=cur.lastrowid))
    return render_template("create_tournament.html", today=date.today().isoformat())


@app.route("/tournaments/<int:tournament_id>")
def tournament(tournament_id):
    t = query_one("""SELECT t.*, u.username AS organizer FROM tournaments t
                     JOIN users u ON u.id = t.organizer_id WHERE t.id = ?""", (tournament_id,))
    if t is None:
        abort(404)
    players = query("""SELECT u.id, u.username FROM enrollments e JOIN users u ON u.id = e.user_id
                       WHERE e.tournament_id = ? ORDER BY e.id""", (tournament_id,))
    matches = query("""SELECT m.*, p1.username AS name1, p2.username AS name2
                       FROM matches m JOIN users p1 ON p1.id = m.player1_id
                       JOIN users p2 ON p2.id = m.player2_id
                       WHERE m.tournament_id = ? ORDER BY m.round, m.id""", (tournament_id,))
    rounds = {}
    for m in matches:
        rounds.setdefault(m["round"], []).append(m)
    enrolled = g.user is not None and any(p["id"] == g.user["id"] for p in players)
    is_owner = g.user is not None and (g.user["id"] == t["organizer_id"] or g.user["role"] == "admin")
    return render_template("tournament.html", t=t, players=players, rounds=rounds,
                           table=tournament_table(tournament_id),
                           enrolled=enrolled, is_owner=is_owner)


@app.post("/tournaments/<int:tournament_id>/enroll")
@login_required
def enroll(tournament_id):
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    if t is None:
        abort(404)
    count = query_one("SELECT COUNT(*) AS c FROM enrollments WHERE tournament_id = ?", (tournament_id,))["c"]
    if g.user["role"] != "player":
        flash("Only player accounts can enroll.", "error")
    elif t["status"] != "open":
        flash("Enrollment is closed for this tournament.", "error")
    elif count >= t["max_players"]:
        flash("This tournament is full.", "error")
    else:
        try:
            execute("INSERT INTO enrollments (tournament_id, user_id) VALUES (?, ?)",
                    (tournament_id, g.user["id"]))
            flash("You're enrolled.", "ok")
        except sqlite3.IntegrityError:
            flash("You're already enrolled.", "error")
    return redirect(url_for("tournament", tournament_id=tournament_id))


@app.post("/tournaments/<int:tournament_id>/leave")
@login_required
def leave(tournament_id):
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    if t is None:
        abort(404)
    if t["status"] != "open":
        flash("You can't leave once the tournament has started.", "error")
    else:
        execute("DELETE FROM enrollments WHERE tournament_id = ? AND user_id = ?",
                (tournament_id, g.user["id"]))
        flash("You left the tournament.", "ok")
    return redirect(url_for("tournament", tournament_id=tournament_id))


@app.post("/tournaments/<int:tournament_id>/remove/<int:user_id>")
@organizer_required
def remove_player(tournament_id, user_id):
    t = get_owned_tournament(tournament_id)
    if t["status"] != "open":
        flash("Players can only be removed before the tournament starts.", "error")
    else:
        execute("DELETE FROM enrollments WHERE tournament_id = ? AND user_id = ?",
                (tournament_id, user_id))
        flash("Player removed.", "ok")
    return redirect(url_for("tournament", tournament_id=tournament_id))


@app.post("/tournaments/<int:tournament_id>/start")
@organizer_required
def start_tournament(tournament_id):
    t = get_owned_tournament(tournament_id)
    players = query("SELECT user_id FROM enrollments WHERE tournament_id = ? ORDER BY id", (tournament_id,))
    if t["status"] != "open":
        flash("This tournament has already started.", "error")
    elif len(players) < 2:
        flash("At least 2 players must enroll before you start.", "error")
    else:
        db = get_db()
        for rnd, pairs in enumerate(round_robin([p["user_id"] for p in players]), start=1):
            for a, b in pairs:
                db.execute("INSERT INTO matches (tournament_id, round, player1_id, player2_id) VALUES (?, ?, ?, ?)",
                           (tournament_id, rnd, a, b))
        db.execute("UPDATE tournaments SET status = 'ongoing' WHERE id = ?", (tournament_id,))
        db.commit()
        flash("Tournament started. Fixtures are ready.", "ok")
    return redirect(url_for("tournament", tournament_id=tournament_id))


@app.post("/tournaments/<int:tournament_id>/delete")
@organizer_required
def delete_tournament(tournament_id):
    get_owned_tournament(tournament_id)
    db = get_db()
    db.execute("DELETE FROM matches WHERE tournament_id = ?", (tournament_id,))
    db.execute("DELETE FROM enrollments WHERE tournament_id = ?", (tournament_id,))
    db.execute("DELETE FROM tournaments WHERE id = ?", (tournament_id,))
    db.commit()
    flash("Tournament deleted.", "ok")
    return redirect(url_for("tournaments"))


@app.post("/matches/<int:match_id>/result")
@organizer_required
def record_result(match_id):
    m = query_one("SELECT * FROM matches WHERE id = ?", (match_id,))
    if m is None:
        abort(404)
    get_owned_tournament(m["tournament_id"])
    try:
        s1, s2 = int(request.form["score1"]), int(request.form["score2"])
        if s1 < 0 or s2 < 0:
            raise ValueError
    except (KeyError, ValueError):
        flash("Enter whole-number scores of 0 or more.", "error")
        return redirect(url_for("tournament", tournament_id=m["tournament_id"]))
    db = get_db()
    db.execute("UPDATE matches SET score1 = ?, score2 = ?, status = 'played' WHERE id = ?", (s1, s2, match_id))
    pending = db.execute("SELECT COUNT(*) FROM matches WHERE tournament_id = ? AND status = 'pending'",
                         (m["tournament_id"],)).fetchone()[0]
    db.execute("UPDATE tournaments SET status = ? WHERE id = ?",
               ("completed" if pending == 0 else "ongoing", m["tournament_id"]))
    db.commit()
    flash("Result saved. The points table is updated.", "ok")
    return redirect(url_for("tournament", tournament_id=m["tournament_id"]) + f"#match-{match_id}")


@app.route("/leaderboard")
def leaderboard():
    return render_template("leaderboard.html", table=global_table())


@app.route("/players/<username>")
def player(username):
    u = query_one("SELECT * FROM users WHERE username = ? AND role = 'player'", (username,))
    if u is None:
        abort(404)
    stats = next(r for r in global_table() if r["id"] == u["id"])
    entered = query("""SELECT t.id, t.name, t.game, t.status FROM enrollments e
                       JOIN tournaments t ON t.id = e.tournament_id
                       WHERE e.user_id = ? ORDER BY t.start_date DESC""", (u["id"],))
    recent = query("""SELECT m.*, p1.username AS name1, p2.username AS name2, t.name AS tournament
                      FROM matches m JOIN users p1 ON p1.id = m.player1_id
                      JOIN users p2 ON p2.id = m.player2_id
                      JOIN tournaments t ON t.id = m.tournament_id
                      WHERE m.status = 'played' AND (m.player1_id = ? OR m.player2_id = ?)
                      ORDER BY m.id DESC LIMIT 10""", (u["id"], u["id"]))
    return render_template("player.html", p=u, stats=stats, entered=entered, recent=recent)


@app.route("/me")
@login_required
def me():
    if g.user["role"] == "player":
        return redirect(url_for("player", username=g.user["username"]))
    mine = query("""SELECT t.*, (SELECT COUNT(*) FROM enrollments e WHERE e.tournament_id = t.id) AS players
                    FROM tournaments t WHERE t.organizer_id = ? ORDER BY t.start_date DESC""", (g.user["id"],))
    return render_template("organizer.html", tournaments=mine)


# ----------------------------------------------------------- REST API for React
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET,PUT,POST,DELETE,OPTIONS"
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def api_options(_path):
    return "", 204


@app.route("/api/auth/me")
def api_me():
    if g.user:
        return jsonify({
            "user": {
                "id": g.user["id"],
                "username": g.user["username"],
                "email": g.user["email"],
                "role": g.user["role"],
                "created_at": g.user["created_at"]
            }
        })
    return jsonify({"user": None})


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or request.form
    ident = (data.get("username") or "").strip()
    password = data.get("password") or ""
    user = query_one("SELECT * FROM users WHERE username = ? OR email = ?", (ident, ident.lower()))
    if user and check_password_hash(user["password_hash"], password):
        session.clear()
        session["user_id"] = user["id"]
        return jsonify({
            "ok": True,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "role": user["role"]
            }
        })
    return jsonify({"ok": False, "error": "Invalid username or password"}), 401


@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or request.form
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role") or "player"

    if not 3 <= len(username) <= 20:
        return jsonify({"ok": False, "error": "Username must be 3 to 20 characters."}), 400
    if "@" not in email:
        return jsonify({"ok": False, "error": "Enter a valid email address."}), 400
    if len(password) < 6:
        return jsonify({"ok": False, "error": "Password must be at least 6 characters."}), 400
    if role not in ("player", "organizer", "admin"):
        return jsonify({"ok": False, "error": "Choose a valid role (player or organizer)."}), 400
    if query_one("SELECT 1 FROM users WHERE username = ? OR email = ?", (username, email)):
        return jsonify({"ok": False, "error": "That username or email is already registered."}), 409

    cur = execute("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
                  (username, email, generate_password_hash(password), role))
    session.clear()
    session["user_id"] = cur.lastrowid
    user = query_one("SELECT * FROM users WHERE id = ?", (cur.lastrowid,))
    return jsonify({
        "ok": True,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"]
        }
    })


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/stats")
def api_stats():
    total_tournaments = query_one("SELECT COUNT(*) AS c FROM tournaments")["c"]
    active_tournaments = query_one("SELECT COUNT(*) AS c FROM tournaments WHERE status = 'ongoing'")["c"]
    open_tournaments = query_one("SELECT COUNT(*) AS c FROM tournaments WHERE status = 'open'")["c"]
    total_players = query_one("SELECT COUNT(*) AS c FROM users WHERE role = 'player'")["c"]
    total_matches = query_one("SELECT COUNT(*) AS c FROM matches")["c"]
    matches_played = query_one("SELECT COUNT(*) AS c FROM matches WHERE status = 'played'")["c"]
    return jsonify({
        "total_tournaments": total_tournaments,
        "active_tournaments": active_tournaments,
        "open_tournaments": open_tournaments,
        "total_players": total_players,
        "total_matches": total_matches,
        "matches_played": matches_played
    })


@app.route("/api/tournaments", methods=["GET"])
def api_tournaments():
    rows = query("""
        SELECT t.*, u.username AS organizer,
               (SELECT COUNT(*) FROM enrollments e WHERE e.tournament_id = t.id) AS players
        FROM tournaments t JOIN users u ON u.id = t.organizer_id
        ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'ongoing' THEN 1 ELSE 2 END, t.start_date""")
    return jsonify([dict(r) for r in rows])


@app.route("/api/tournaments", methods=["POST"])
def api_create_tournament():
    if not g.user or g.user["role"] not in ("organizer", "admin"):
        return jsonify({"ok": False, "error": "Organizer or Admin access required."}), 403
    data = request.get_json(silent=True) or request.form
    name = (data.get("name") or "").strip()
    game = (data.get("game") or "").strip()
    description = (data.get("description") or "").strip()
    start_date = data.get("start_date") or ""
    try:
        max_players = int(data.get("max_players") or 0)
        date.fromisoformat(start_date)
    except (ValueError, TypeError):
        max_players, start_date = 0, ""
    if not name or not game:
        return jsonify({"ok": False, "error": "Tournament name and game are required."}), 400
    if not start_date:
        return jsonify({"ok": False, "error": "Enter a valid start date (YYYY-MM-DD)."}), 400
    if not 2 <= max_players <= 64:
        return jsonify({"ok": False, "error": "Max players must be between 2 and 64."}), 400

    cur = execute("""INSERT INTO tournaments (name, game, description, start_date, max_players, organizer_id)
                     VALUES (?, ?, ?, ?, ?, ?)""",
                  (name, game, description, start_date, max_players, g.user["id"]))
    return jsonify({"ok": True, "id": cur.lastrowid})


@app.route("/api/tournaments/<int:tournament_id>")
def api_tournament(tournament_id):
    t = query_one("""SELECT t.*, u.username AS organizer FROM tournaments t
                     JOIN users u ON u.id = t.organizer_id WHERE t.id = ?""", (tournament_id,))
    if t is None:
        return jsonify({"ok": False, "error": "Tournament not found"}), 404
    players = query("""SELECT u.id, u.username, u.email FROM enrollments e JOIN users u ON u.id = e.user_id
                       WHERE e.tournament_id = ? ORDER BY e.id""", (tournament_id,))
    matches = query("""SELECT m.*, p1.username AS name1, p2.username AS name2
                       FROM matches m JOIN users p1 ON p1.id = m.player1_id
                       JOIN users p2 ON p2.id = m.player2_id
                       WHERE m.tournament_id = ? ORDER BY m.round, m.id""", (tournament_id,))
    rounds = {}
    for m in matches:
        rounds.setdefault(m["round"], []).append(dict(m))
    enrolled = g.user is not None and any(p["id"] == g.user["id"] for p in players)
    is_owner = g.user is not None and (g.user["id"] == t["organizer_id"] or g.user["role"] == "admin")
    standings = tournament_table(tournament_id)
    return jsonify({
        "ok": True,
        "tournament": dict(t),
        "players": [dict(p) for p in players],
        "matches": [dict(m) for m in matches],
        "rounds": rounds,
        "standings": standings,
        "enrolled": enrolled,
        "is_owner": is_owner
    })


@app.route("/api/tournaments/<int:tournament_id>", methods=["DELETE"])
@app.route("/api/tournaments/<int:tournament_id>/delete", methods=["POST"])
def api_delete_tournament(tournament_id):
    if not g.user or g.user["role"] not in ("organizer", "admin"):
        return jsonify({"ok": False, "error": "Organizer or Admin access required."}), 403
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    if t is None:
        return jsonify({"ok": False, "error": "Tournament not found."}), 404
    if g.user["role"] != "admin" and t["organizer_id"] != g.user["id"]:
        return jsonify({"ok": False, "error": "Only the tournament creator or an admin can delete this tournament."}), 403
    db = get_db()
    db.execute("DELETE FROM matches WHERE tournament_id = ?", (tournament_id,))
    db.execute("DELETE FROM enrollments WHERE tournament_id = ?", (tournament_id,))
    db.execute("DELETE FROM tournaments WHERE id = ?", (tournament_id,))
    db.commit()
    return jsonify({"ok": True, "message": "Tournament deleted successfully."})


@app.route("/api/tournaments/<int:tournament_id>/enroll", methods=["POST"])
def api_enroll(tournament_id):
    if not g.user:
        return jsonify({"ok": False, "error": "Please log in to enroll."}), 401
    if g.user["role"] != "player":
        return jsonify({"ok": False, "error": "Only player accounts can enroll."}), 403
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    if not t:
        return jsonify({"ok": False, "error": "Tournament not found"}), 404
    if t["status"] != "open":
        return jsonify({"ok": False, "error": "Enrollment is closed for this tournament."}), 400
    count = query_one("SELECT COUNT(*) AS c FROM enrollments WHERE tournament_id = ?", (tournament_id,))["c"]
    if count >= t["max_players"]:
        return jsonify({"ok": False, "error": "This tournament is already full."}), 400
    try:
        execute("INSERT INTO enrollments (tournament_id, user_id) VALUES (?, ?)", (tournament_id, g.user["id"]))
        return jsonify({"ok": True, "message": "Enrolled successfully!"})
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "You are already enrolled."}), 400


@app.route("/api/tournaments/<int:tournament_id>/leave", methods=["POST"])
def api_leave(tournament_id):
    if not g.user:
        return jsonify({"ok": False, "error": "Please log in to continue."}), 401
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    if not t:
        return jsonify({"ok": False, "error": "Tournament not found"}), 404
    if t["status"] != "open":
        return jsonify({"ok": False, "error": "Cannot leave after the tournament starts."}), 400
    execute("DELETE FROM enrollments WHERE tournament_id = ? AND user_id = ?", (tournament_id, g.user["id"]))
    return jsonify({"ok": True, "message": "You left the tournament."})


@app.route("/api/tournaments/<int:tournament_id>/remove/<int:user_id>", methods=["POST"])
def api_remove_player(tournament_id, user_id):
    if not g.user or g.user["role"] not in ("organizer", "admin"):
        return jsonify({"ok": False, "error": "Organizer or Admin access required."}), 403
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    if not t or (g.user["role"] != "admin" and t["organizer_id"] != g.user["id"]):
        return jsonify({"ok": False, "error": "Unauthorized"}), 403
    if t["status"] != "open":
        return jsonify({"ok": False, "error": "Players can only be removed before tournament starts."}), 400
    execute("DELETE FROM enrollments WHERE tournament_id = ? AND user_id = ?", (tournament_id, user_id))
    return jsonify({"ok": True, "message": "Player removed."})


@app.route("/api/tournaments/<int:tournament_id>/start", methods=["POST"])
def api_start_tournament(tournament_id):
    if not g.user or g.user["role"] not in ("organizer", "admin"):
        return jsonify({"ok": False, "error": "Organizer or Admin access required."}), 403
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    if not t or (g.user["role"] != "admin" and t["organizer_id"] != g.user["id"]):
        return jsonify({"ok": False, "error": "Unauthorized"}), 403
    if t["status"] != "open":
        return jsonify({"ok": False, "error": "Tournament has already started."}), 400
    players = query("SELECT user_id FROM enrollments WHERE tournament_id = ? ORDER BY id", (tournament_id,))
    if len(players) < 2:
        return jsonify({"ok": False, "error": "At least 2 players are required to start the tournament."}), 400
    db = get_db()
    for rnd, pairs in enumerate(round_robin([p["user_id"] for p in players]), start=1):
        for a, b in pairs:
            db.execute("INSERT INTO matches (tournament_id, round, player1_id, player2_id) VALUES (?, ?, ?, ?)",
                       (tournament_id, rnd, a, b))
    db.execute("UPDATE tournaments SET status = 'ongoing' WHERE id = ?", (tournament_id,))
    db.commit()
    return jsonify({"ok": True, "message": "Tournament started and fixtures generated."})


@app.route("/api/matches/<int:match_id>/result", methods=["POST"])
def api_record_result(match_id):
    if not g.user or g.user["role"] not in ("organizer", "admin"):
        return jsonify({"ok": False, "error": "Organizer or Admin access required."}), 403
    m = query_one("SELECT * FROM matches WHERE id = ?", (match_id,))
    if not m:
        return jsonify({"ok": False, "error": "Match not found"}), 404
    t = query_one("SELECT * FROM tournaments WHERE id = ?", (m["tournament_id"],))
    if not t or (g.user["role"] != "admin" and t["organizer_id"] != g.user["id"]):
        return jsonify({"ok": False, "error": "Unauthorized"}), 403
    data = request.get_json(silent=True) or request.form
    try:
        s1 = int(data.get("score1"))
        s2 = int(data.get("score2"))
        if s1 < 0 or s2 < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Scores must be positive whole numbers."}), 400
    db = get_db()
    db.execute("UPDATE matches SET score1 = ?, score2 = ?, status = 'played' WHERE id = ?", (s1, s2, match_id))
    pending = db.execute("SELECT COUNT(*) FROM matches WHERE tournament_id = ? AND status = 'pending'",
                         (m["tournament_id"],)).fetchone()[0]
    db.execute("UPDATE tournaments SET status = ? WHERE id = ?",
               ("completed" if pending == 0 else "ongoing", m["tournament_id"]))
    db.commit()
    return jsonify({"ok": True, "message": "Result saved and standings updated."})


@app.route("/api/leaderboard")
def api_leaderboard():
    table = global_table()
    return jsonify(table)


@app.route("/api/players/<username>")
def api_player(username):
    u = query_one("SELECT id, username, email, role, created_at FROM users WHERE username = ? AND role = 'player'", (username,))
    if u is None:
        return jsonify({"ok": False, "error": "Player not found"}), 404
    stats_list = [r for r in global_table() if r["id"] == u["id"]]
    stats = stats_list[0] if stats_list else {"played": 0, "wins": 0, "draws": 0, "losses": 0, "points": 0, "gf": 0, "ga": 0, "diff": 0, "rank": "-"}
    entered = query("""SELECT t.id, t.name, t.game, t.status, t.start_date FROM enrollments e
                       JOIN tournaments t ON t.id = e.tournament_id
                       WHERE e.user_id = ? ORDER BY t.start_date DESC""", (u["id"],))
    recent = query("""SELECT m.*, p1.username AS name1, p2.username AS name2, t.name AS tournament
                      FROM matches m JOIN users p1 ON p1.id = m.player1_id
                      JOIN users p2 ON p2.id = m.player2_id
                      JOIN tournaments t ON t.id = m.tournament_id
                      WHERE m.status = 'played' AND (m.player1_id = ? OR m.player2_id = ?)
                      ORDER BY m.id DESC LIMIT 10""", (u["id"], u["id"]))
    return jsonify({
        "ok": True,
        "player": dict(u),
        "stats": stats,
        "entered": [dict(t) for t in entered],
        "recent": [dict(m) for m in recent]
    })




@app.route("/admin/users")
def classic_admin_users():
    if not g.user or g.user["role"] != "admin":
        abort(403)
    users = query("SELECT id, username, email, role, created_at FROM users ORDER BY id DESC")
    return render_template("users.html", users=users)


@app.post("/admin/users/<int:user_id>/delete")
def classic_admin_delete_user(user_id):
    if not g.user or g.user["role"] != "admin":
        abort(403)
    if g.user["id"] == user_id:
        flash("Cannot delete your own admin account.", "error")
        return redirect(url_for("classic_admin_users"))
    db = get_db()
    db.execute("DELETE FROM enrollments WHERE user_id = ?", (user_id,))
    db.execute("DELETE FROM matches WHERE player1_id = ? OR player2_id = ?", (user_id, user_id))
    db.execute("DELETE FROM tournaments WHERE organizer_id = ?", (user_id,))
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    flash("User account deleted.", "ok")
    return redirect(url_for("classic_admin_users"))

@app.route("/api/admin/users", methods=["GET"])
def api_admin_users():
    if not g.user or g.user["role"] != "admin":
        return jsonify({"ok": False, "error": "Admin access required."}), 403
    users = query("SELECT id, username, email, role, created_at FROM users ORDER BY id DESC")
    return jsonify({"ok": True, "users": [dict(u) for u in users]})


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
def api_admin_delete_user(user_id):
    if not g.user or g.user["role"] != "admin":
        return jsonify({"ok": False, "error": "Admin access required."}), 403
    if g.user["id"] == user_id:
        return jsonify({"ok": False, "error": "Cannot delete your own admin account."}), 400
    db = get_db()
    db.execute("DELETE FROM enrollments WHERE user_id = ?", (user_id,))
    db.execute("DELETE FROM matches WHERE player1_id = ? OR player2_id = ?", (user_id, user_id))
    db.execute("DELETE FROM tournaments WHERE organizer_id = ?", (user_id,))
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return jsonify({"ok": True, "message": "User deleted successfully."})


@app.errorhandler(403)
def forbidden(_e):
    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "error": "Forbidden"}), 403
    return render_template("error.html", code=403, message="You don't have access to this page."), 403


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "error": "Not found"}), 404
    return render_template("error.html", code=404, message="That page doesn't exist."), 404


@app.route("/<path:filename>")
def serve_dist_static(filename):
    target = os.path.join(DIST_DIR, filename)
    if os.path.exists(target) and os.path.isfile(target):
        return send_from_directory(DIST_DIR, filename)
    if os.path.exists(os.path.join(DIST_DIR, "index.html")) and not filename.startswith("api/"):
        return send_from_directory(DIST_DIR, "index.html")
    abort(404)


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
