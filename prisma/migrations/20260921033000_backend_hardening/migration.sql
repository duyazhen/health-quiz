-- AlterTable
ALTER TABLE `health_results` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `currentPeriodEnd` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `planType` ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly';
ALTER TABLE `payments` ADD COLUMN `callbackAt` DATETIME(3) NULL;
ALTER TABLE `payments` ADD COLUMN `callbackPayload` JSON NULL;

-- AlterTable
ALTER TABLE `assessment_progress` ADD COLUMN `answers` JSON NULL;

-- Deduplicate progress rows (keep latest)
DELETE `p1` FROM `assessment_progress` `p1`
INNER JOIN `assessment_progress` `p2`
WHERE `p1`.`userId` = `p2`.`userId`
  AND (`p1`.`updatedAt` < `p2`.`updatedAt` OR (`p1`.`updatedAt` = `p2`.`updatedAt` AND `p1`.`id` < `p2`.`id`));

CREATE UNIQUE INDEX `assessment_progress_userId_key` ON `assessment_progress`(`userId`);
DROP INDEX `assessment_progress_userId_idx` ON `assessment_progress`;
