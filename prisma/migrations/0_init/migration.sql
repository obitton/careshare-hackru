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
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "background_check_status" TEXT NOT NULL DEFAULT 'Not Started',
    "availability_schedule" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "scheduled_appointment_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationCall" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "call_sid" TEXT,
    "role" TEXT,

    CONSTRAINT "ConversationCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundConversation_scheduled_appointment_id_key" ON "InboundConversation"("scheduled_appointment_id");

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

-- CreateIndex
CREATE INDEX "Appointment_senior_id_idx" ON "Appointment"("senior_id");

-- CreateIndex
CREATE INDEX "Appointment_volunteer_id_idx" ON "Appointment"("volunteer_id");

-- CreateIndex
CREATE INDEX "EmergencyContact_senior_id_idx" ON "EmergencyContact"("senior_id");

-- CreateIndex
CREATE INDEX "CallAttempt_senior_id_idx" ON "CallAttempt"("senior_id");

-- CreateIndex
CREATE INDEX "CallAttempt_volunteer_id_idx" ON "CallAttempt"("volunteer_id");

-- CreateIndex
CREATE INDEX "InboundConversation_senior_id_idx" ON "InboundConversation"("senior_id");

-- CreateIndex
CREATE INDEX "ConversationCall_conversation_id_idx" ON "ConversationCall"("conversation_id");

-- CreateIndex
CREATE INDEX "ConversationCall_volunteer_id_idx" ON "ConversationCall"("volunteer_id");
