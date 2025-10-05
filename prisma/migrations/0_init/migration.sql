-- This is an empty migration.
-- Drop all existing tables to start fresh
DROP TABLE IF EXISTS "Senior", "Volunteer", "Appointment", "EmergencyContact", "CallAttempt", "InboundConversation", "ConversationCall", "Accommodation", "SeniorAccommodation", "SeniorPreferredVolunteer", "Skill", "VolunteerSkill", "_prisma_migrations" CASCADE;

-- CreateTable
CREATE TABLE "Senior" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT,
    "email" TEXT,
    "street_address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Senior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Volunteer" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT,
    "email" TEXT NOT NULL,
    "bio" TEXT,
    "background_check_status" TEXT DEFAULT 'Not Started',
    "availability_schedule" JSONB,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "zip_code" TEXT,

    CONSTRAINT "Volunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" SERIAL NOT NULL,
    "senior_id" INTEGER NOT NULL,
    "volunteer_id" INTEGER,
    "appointment_datetime" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER,
    "location" TEXT,
    "status" TEXT NOT NULL,
    "notes_for_volunteer" TEXT,
    "feedback_from_senior" TEXT,
    "feedback_from_volunteer" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" SERIAL NOT NULL,
    "senior_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAttempt" (
    "id" SERIAL NOT NULL,
    "senior_id" INTEGER NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundConversation" (
    "id" SERIAL NOT NULL,
    "senior_id" INTEGER,
    "caller_phone_number" TEXT,
    "request_details" TEXT,
    "matched_skill" TEXT,
    "nearby_volunteers" JSONB,
    "status" TEXT DEFAULT 'OPEN',
    "scheduled_appointment_id" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "InboundConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationCall" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "call_sid" TEXT,
    "role" TEXT,

    CONSTRAINT "ConversationCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accommodation" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeniorAccommodation" (
    "senior_id" BIGINT NOT NULL,
    "accommodation_id" BIGINT NOT NULL,

    CONSTRAINT "SeniorAccommodation_pkey" PRIMARY KEY ("senior_id","accommodation_id")
);

-- CreateTable
CREATE TABLE "SeniorPreferredVolunteer" (
    "senior_id" BIGINT NOT NULL,
    "volunteer_id" BIGINT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "SeniorPreferredVolunteer_pkey" PRIMARY KEY ("senior_id","volunteer_id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerSkill" (
    "volunteer_id" INTEGER NOT NULL,
    "skill_id" INTEGER NOT NULL,

    CONSTRAINT "VolunteerSkill_pkey" PRIMARY KEY ("volunteer_id","skill_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundConversation_scheduled_appointment_id_key" ON "InboundConversation"("scheduled_appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_senior_id_fkey" FOREIGN KEY ("senior_id") REFERENCES "Senior"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_senior_id_fkey" FOREIGN KEY ("senior_id") REFERENCES "Senior"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_senior_id_fkey" FOREIGN KEY ("senior_id") REFERENCES "Senior"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundConversation" ADD CONSTRAINT "InboundConversation_senior_id_fkey" FOREIGN KEY ("senior_id") REFERENCES "Senior"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundConversation" ADD CONSTRAINT "InboundConversation_scheduled_appointment_id_fkey" FOREIGN KEY ("scheduled_appointment_id") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationCall" ADD CONSTRAINT "ConversationCall_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "InboundConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationCall" ADD CONSTRAINT "ConversationCall_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeniorAccommodation" ADD CONSTRAINT "SeniorAccommodation_senior_id_fkey" FOREIGN KEY ("senior_id") REFERENCES "Senior"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeniorAccommodation" ADD CONSTRAINT "SeniorAccommodation_accommodation_id_fkey" FOREIGN KEY ("accommodation_id") REFERENCES "Accommodation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeniorPreferredVolunteer" ADD CONSTRAINT "SeniorPreferredVolunteer_senior_id_fkey" FOREIGN KEY ("senior_id") REFERENCES "Senior"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeniorPreferredVolunteer" ADD CONSTRAINT "SeniorPreferredVolunteer_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerSkill" ADD CONSTRAINT "VolunteerSkill_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerSkill" ADD CONSTRAINT "VolunteerSkill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
