import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import zipcodes from 'zipcodes';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' },
});

async function seedDatabase() {
  console.log('Recreating tables and seeding database...');
  
  // Manually run the schema logic here
  await pool.query('DROP TABLE IF EXISTS emergency_contacts, appointments, volunteers, seniors, skills, volunteer_skills CASCADE');
  const schemaSql = `
    CREATE TABLE seniors (
      id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone_number TEXT, email TEXT,
      street_address TEXT, city TEXT, state TEXT, zip_code TEXT, is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE skills (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE volunteers (
      id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone_number TEXT, email TEXT NOT NULL,
      bio TEXT, zip_code TEXT, background_check_status TEXT DEFAULT 'Not Started', availability_schedule JSONB,
      is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE volunteer_skills (
      volunteer_id INT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
      skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      PRIMARY KEY (volunteer_id, skill_id)
    );
    CREATE TABLE appointments (
      id SERIAL PRIMARY KEY, senior_id INT NOT NULL REFERENCES seniors(id) ON DELETE CASCADE,
      volunteer_id INT REFERENCES volunteers(id), appointment_datetime TIMESTAMPTZ NOT NULL, duration_minutes INT,
      location TEXT, status TEXT NOT NULL, notes_for_volunteer TEXT, feedback_from_senior TEXT,
      feedback_from_volunteer TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE emergency_contacts (
      id SERIAL PRIMARY KEY, senior_id INT NOT NULL REFERENCES seniors(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL, phone_number TEXT NOT NULL, relationship TEXT NOT NULL
    );
  `;
  await pool.query(schemaSql);
  console.log('Schema created.');

  const seniors = [
    { first_name: 'Arthur', last_name: 'Pendragon', zip_code: '90210', phone_number: '+12015551234' },
    { first_name: 'Eleanor', last_name: 'Vance', zip_code: '10001', phone_number: '+15558675309' },
  ];
  const seniorResult = await pool.query(
    `INSERT INTO seniors (first_name, last_name, zip_code, phone_number)
     SELECT first_name, last_name, zip_code, phone_number FROM jsonb_to_recordset($1) AS x(first_name text, last_name text, zip_code text, phone_number text)
     RETURNING id, first_name`,
    [JSON.stringify(seniors)]
  );
  console.log('Seeded seniors.');

  const volunteers = [
    { first_name: 'David', last_name: 'Chen', zip_code: '90211', email: 'david@example.com', phone_number: '+19085555678' },
    { first_name: 'Maria', last_name: 'Garcia', zip_code: '10002', email: 'maria@example.com', phone_number: '+12125559999' },
  ];
  const volunteerResult = await pool.query(
    `INSERT INTO volunteers (first_name, last_name, zip_code, email, phone_number)
     SELECT first_name, last_name, zip_code, email, phone_number FROM jsonb_to_recordset($1) AS x(first_name text, last_name text, zip_code text, email text, phone_number text)
     RETURNING id, first_name`,
    [JSON.stringify(volunteers)]
  );
  console.log('Seeded volunteers.');

  const skills = [{ name: 'Driving' }, { name: 'Grocery Shopping' }, { name: 'Tech Help' }, { name: 'Gardening' }, { name: 'Companionship' }];
  const skillResult = await pool.query(
    `INSERT INTO skills (name) SELECT name FROM jsonb_to_recordset($1) AS x(name text) RETURNING id, name`,
    [JSON.stringify(skills)]
  );
  console.log('Seeded skills.');

  const david = volunteerResult.rows.find(v => v.first_name === 'David');
  const maria = volunteerResult.rows.find(v => v.first_name === 'Maria');
  const driving = skillResult.rows.find(s => s.name === 'Driving');
  const shopping = skillResult.rows.find(s => s.name === 'Grocery Shopping');
  const tech = skillResult.rows.find(s => s.name === 'Tech Help');
  const gardening = skillResult.rows.find(s => s.name === 'Gardening');
  const companionship = skillResult.rows.find(s => s.name === 'Companionship');

  const volunteerSkills = [
    { volunteer_id: david.id, skill_id: gardening.id },
    { volunteer_id: david.id, skill_id: companionship.id },
    { volunteer_id: maria.id, skill_id: driving.id },
    { volunteer_id: maria.id, skill_id: shopping.id },
    { volunteer_id: maria.id, skill_id: tech.id },
  ];
  await pool.query(
    `INSERT INTO volunteer_skills (volunteer_id, skill_id)
     SELECT volunteer_id, skill_id FROM jsonb_to_recordset($1) AS x(volunteer_id int, skill_id int)`,
    [JSON.stringify(volunteerSkills)]
  );
  console.log('Seeded volunteer skills.');
  
  const arthur = seniorResult.rows.find(s => s.first_name === 'Arthur');

  const appointments = [
    { senior_id: arthur.id, appointment_datetime: '2025-10-07 10:00:00', status: 'Requested', notes_for_volunteer: 'Need a ride to the community center for a social event.' },
  ];
  await pool.query(
    `INSERT INTO appointments (senior_id, appointment_datetime, status, notes_for_volunteer)
     SELECT senior_id, appointment_datetime::timestamptz, status, notes_for_volunteer FROM jsonb_to_recordset($1) AS x(senior_id int, appointment_datetime text, status text, notes_for_volunteer text)`,
    [JSON.stringify(appointments)]
  );
  console.log('Seeded appointments.');

  console.log('Database seeding complete.');
  await pool.end();
}

seedDatabase().catch(err => {
  console.error('Seeding failed:', err);
  pool.end();
  process.exit(1);
});
