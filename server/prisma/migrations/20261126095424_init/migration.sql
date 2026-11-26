-- CreateTable
CREATE TABLE `ScannerPairing` (
    `userId` INTEGER NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `phoneToken` VARCHAR(80) NOT NULL,
    `streamToken` VARCHAR(80) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ScannerPairing_code_key`(`code`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ScannerPairing` ADD CONSTRAINT `ScannerPairing_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
