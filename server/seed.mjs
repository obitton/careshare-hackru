import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear existing data to prevent duplicates
  await prisma.volunteer.deleteMany({});
  await prisma.senior.deleteMany({});

  // Seed Seniors
  const seniors = await prisma.senior.createMany({
    data: [
      {
        id: 1,
        first_name: 'Arthur',
        last_name: 'Pendragon',
        phone_number: '+12015551234',
        street_address: '123 Camelot Drive',
        city: 'Beverly Hills',
        state: 'CA',
        zip_code: '90210',
        is_active: true,
      },
      {
        id: 2,
        first_name: 'Eleanor',
        last_name: 'Vance',
        phone_number: '+15164770955',
        street_address: '456 Hill House Lane',
        city: 'Beverly Hills',
        state: 'CA',
        zip_code: '90210',
        is_active: true,
      },
    ],
  });
  console.log(`Created ${seniors.count} seniors`);

  // Seed Volunteers
  const volunteers = await prisma.volunteer.createMany({
    data: [
      {
        id: 1,
        first_name: 'David',
        last_name: 'Chen',
        phone_number: '+16463210545',
        email: 'david@example.com',
        zip_code: '90211',
        background_check_status: 'Not Started',
        is_active: true,
      },
      {
        id: 2,
        first_name: 'Maria',
        last_name: 'Garcia',
        phone_number: '+16463210545',
        email: 'maria@example.com',
        zip_code: '90210',
        background_check_status: 'Not Started',
        is_active: true,
      },
    ],
  });
  console.log(`Created ${volunteers.count} volunteers`);

  // Seed Skills
  await prisma.skill.deleteMany({});
  const skills = await prisma.skill.createMany({
    data: [
      { name: 'Driving' },
      { name: 'Grocery Shopping' },
      { name: 'Tech Help' },
      { name: 'Gardening' },
      { name: 'Companionship' },
    ],
  });
  console.log(`Created ${skills.count} skills`);

  // Link skills to volunteers
  const driving = await prisma.skill.findUnique({ where: { name: 'Driving' } });
  const shopping = await prisma.skill.findUnique({ where: { name: 'Grocery Shopping' } });
  const tech = await prisma.skill.findUnique({ where: { name: 'Tech Help' } });
  const gardening = await prisma.skill.findUnique({ where: { name: 'Gardening' } });
  const companionship = await prisma.skill.findUnique({ where: { name: 'Companionship' } });
  const david = await prisma.volunteer.findFirst({ where: { first_name: 'David' } });
  const maria = await prisma.volunteer.findFirst({ where: { first_name: 'Maria' } });

  await prisma.volunteerSkill.deleteMany({});
  if (david && gardening && companionship) {
    await prisma.volunteerSkill.createMany({
      data: [
        { volunteer_id: david.id, skill_id: gardening.id },
        { volunteer_id: david.id, skill_id: companionship.id },
      ],
    });
  }
  if (maria && driving && shopping && tech) {
    await prisma.volunteerSkill.createMany({
      data: [
        { volunteer_id: maria.id, skill_id: driving.id },
        { volunteer_id: maria.id, skill_id: shopping.id },
        { volunteer_id: maria.id, skill_id: tech.id },
      ],
    });
  }
  console.log('Linked skills to volunteers.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
