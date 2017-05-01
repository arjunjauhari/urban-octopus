DROP TABLE IF EXISTS yes CASCADE;
DROP TABLE IF EXISTS no CASCADE;
DROP TABLE IF EXISTS heartmonitordata CASCADE;
DROP TABLE IF EXISTS accelerometerdata CASCADE;

CREATE TABLE yes {
  id SERIAL PRIMARY KEY,
  created_at timestamp,
}

CREATE TABLE no {
  id SERIAL PRIMARY KEY,
  created_at timestamp,
}

CREATE TABLE heartmonitordata (
  id SERIAL PRIMARY KEY,
  created_at timestamp,
  bpm INTEGER,
  heartmonitordata_id INTEGER REFERENCES yes(id)||no(id)
);

CREATE TABLE accelerometerdata (
  id SERIAL PRIMARY KEY,
  created_at timestamp,
  xaxis INTEGER,
  yaxis INTEGER,
  zaxis INTEGER,
  accelerometerdata_id INTEGER REFERENCES yes(id)||no(id)
);
