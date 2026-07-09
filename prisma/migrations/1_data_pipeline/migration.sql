-- CreateTable
CREATE TABLE "LessonSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "laneInfo" TEXT NOT NULL,
    "notice" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "freeSwim" JSONB NOT NULL,
    "lessons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dbUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeTier" (
    "id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "FeeTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlSnapshot" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshnessAlert" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "oldHash" TEXT NOT NULL,
    "newHash" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FreshnessAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPushTarget" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPushTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonSubscription_endpoint_key" ON "LessonSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "FeeTier_tier_target_key" ON "FeeTier"("tier", "target");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlSnapshot_url_key" ON "CrawlSnapshot"("url");

-- CreateIndex
CREATE INDEX "FreshnessAlert_resolved_detectedAt_idx" ON "FreshnessAlert"("resolved", "detectedAt");

