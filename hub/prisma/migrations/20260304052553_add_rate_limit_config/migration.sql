-- CreateTable
CREATE TABLE "RateLimitConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "endpointPattern" TEXT NOT NULL,
    "windowMs" INTEGER NOT NULL,
    "maxRequests" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitConfig_endpointPattern_idx" ON "RateLimitConfig"("endpointPattern");

-- CreateIndex
CREATE INDEX "RateLimitConfig_enabled_idx" ON "RateLimitConfig"("enabled");
