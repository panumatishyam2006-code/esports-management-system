"""Optional demo data: one organizer, six players, one tournament with some results.
Run once:  python seed.py     (logins use password 'password123')"""
import random
import app as A
from werkzeug.security import generate_password_hash

random.seed(7)
A.init_db()
with A.app.app_context():
    db = A.get_db()
    if db.execute("SELECT 1 FROM users").fetchone():
        raise SystemExit("Database already has data; delete esports.db to reseed.")
    pw = generate_password_hash("password123")
    db.execute("INSERT INTO users (username,email,password_hash,role) VALUES ('organizer','org@example.com',?, 'organizer')", (pw,))
    names = ["Kira", "Blaze", "Nova", "Rex", "Echo", "Vortex"]
    for n in names:
        db.execute("INSERT INTO users (username,email,password_hash,role) VALUES (?,?,?, 'player')",
                   (n, f"{n.lower()}@example.com", pw))
    db.execute("""INSERT INTO tournaments (name,game,description,start_date,max_players,status,organizer_id)
                  VALUES ('Autumn Cup','Rocket League','Round-robin league for the season.','2026-10-15',8,'ongoing',1)""")
    pids = [r[0] for r in db.execute("SELECT id FROM users WHERE role='player'")]
    for p in pids:
        db.execute("INSERT INTO enrollments (tournament_id,user_id) VALUES (1,?)", (p,))
    for rnd, pairs in enumerate(A.round_robin(pids), start=1):
        for a, b in pairs:
            if rnd <= 3:
                db.execute("INSERT INTO matches (tournament_id,round,player1_id,player2_id,score1,score2,status) VALUES (1,?,?,?,?,?,'played')",
                           (rnd, a, b, random.randint(0, 5), random.randint(0, 5)))
            else:
                db.execute("INSERT INTO matches (tournament_id,round,player1_id,player2_id) VALUES (1,?,?,?)", (rnd, a, b))
    db.commit()
print("Seeded. Log in as 'organizer' or any of:", ", ".join(names), "- password: password123")
