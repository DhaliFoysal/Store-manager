-- CreateTable
CREATE TABLE `Store` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
    `logoPath` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `phone` VARCHAR(40) NULL,
    `email` VARCHAR(150) NULL,
    `voucherNotes` TEXT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'BDT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'OWNER', 'ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `status` ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `permissions` JSON NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_storeId_role_idx`(`storeId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordReset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordReset_tokenHash_key`(`tokenHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Counter` (
    `storeId` INTEGER NOT NULL,
    `key` VARCHAR(20) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`storeId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `Category_storeId_name_key`(`storeId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Warehouse` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `address` VARCHAR(255) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Warehouse_storeId_name_key`(`storeId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `categoryId` INTEGER NULL,
    `sku` VARCHAR(60) NOT NULL,
    `barcode` VARCHAR(100) NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `costPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `salePrice` DECIMAL(14, 2) NOT NULL,
    `warrantyMonths` INTEGER NOT NULL DEFAULT 0,
    `trackSerial` BOOLEAN NOT NULL DEFAULT false,
    `reorderLevel` INTEGER NOT NULL DEFAULT 0,
    `totalStock` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Product_storeId_name_idx`(`storeId`, `name`),
    UNIQUE INDEX `Product_storeId_sku_key`(`storeId`, `sku`),
    UNIQUE INDEX `Product_storeId_barcode_key`(`storeId`, `barcode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockLevel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `StockLevel_productId_warehouseId_key`(`productId`, `warehouseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductUnit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `serialNumber` VARCHAR(120) NOT NULL,
    `status` ENUM('IN_STOCK', 'SOLD', 'DEFECTIVE', 'LOST') NOT NULL DEFAULT 'IN_STOCK',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductUnit_productId_status_idx`(`productId`, `status`),
    INDEX `ProductUnit_warehouseId_idx`(`warehouseId`),
    UNIQUE INDEX `ProductUnit_storeId_serialNumber_key`(`storeId`, `serialNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockMovement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `warehouseId` INTEGER NOT NULL,
    `type` ENUM('RECEIVE', 'SALE', 'ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT', 'VOID_RETURN') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `refType` VARCHAR(30) NULL,
    `refId` INTEGER NULL,
    `note` VARCHAR(255) NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockMovement_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `StockMovement_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(40) NOT NULL,
    `email` VARCHAR(150) NULL,
    `address` TEXT NULL,
    `credit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_storeId_name_idx`(`storeId`, `name`),
    UNIQUE INDEX `Customer_storeId_phone_key`(`storeId`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerLedger` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `customerId` INTEGER NOT NULL,
    `type` ENUM('DEPOSIT', 'OVERPAYMENT', 'CREDIT_USED', 'VOID_REFUND') NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `balanceAfter` DECIMAL(14, 2) NOT NULL,
    `refType` VARCHAR(30) NULL,
    `refId` INTEGER NULL,
    `note` VARCHAR(255) NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerLedger_customerId_createdAt_idx`(`customerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `voucherNo` VARCHAR(30) NOT NULL,
    `customerId` INTEGER NULL,
    `warehouseId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL,
    `creditUsed` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `paidAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `dueAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `changeReturned` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `status` ENUM('PAID', 'PARTIAL', 'DUE', 'VOID') NOT NULL DEFAULT 'PAID',
    `notes` VARCHAR(500) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Sale_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `Sale_storeId_status_idx`(`storeId`, `status`),
    INDEX `Sale_customerId_idx`(`customerId`),
    UNIQUE INDEX `Sale_storeId_voucherNo_key`(`storeId`, `voucherNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaleItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `saleId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `productUnitId` INTEGER NULL,
    `productName` VARCHAR(200) NOT NULL,
    `sku` VARCHAR(60) NOT NULL,
    `serialNumber` VARCHAR(120) NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DECIMAL(14, 2) NOT NULL,
    `discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `lineTotal` DECIMAL(14, 2) NOT NULL,
    `warrantyMonths` INTEGER NOT NULL DEFAULT 0,
    `warrantyStart` DATETIME(3) NULL,
    `warrantyEnd` DATETIME(3) NULL,

    UNIQUE INDEX `SaleItem_productUnitId_key`(`productUnitId`),
    INDEX `SaleItem_serialNumber_idx`(`serialNumber`),
    INDEX `SaleItem_warrantyEnd_idx`(`warrantyEnd`),
    INDEX `SaleItem_saleId_idx`(`saleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `slipNo` VARCHAR(30) NOT NULL,
    `saleId` INTEGER NULL,
    `customerId` INTEGER NULL,
    `method` ENUM('CASH', 'CARD', 'BKASH', 'NAGAD', 'BANK', 'CREDIT') NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `appliedAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `creditedAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `saleDueAfter` DECIMAL(14, 2) NULL,
    `reference` VARCHAR(120) NULL,
    `note` VARCHAR(255) NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_saleId_idx`(`saleId`),
    INDEX `Payment_customerId_idx`(`customerId`),
    INDEX `Payment_storeId_createdAt_idx`(`storeId`, `createdAt`),
    UNIQUE INDEX `Payment_storeId_slipNo_key`(`storeId`, `slipNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WarrantyClaim` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `ticketNo` VARCHAR(30) NOT NULL,
    `saleItemId` INTEGER NOT NULL,
    `issue` TEXT NOT NULL,
    `status` ENUM('RECEIVED', 'IN_REPAIR', 'REPAIRED', 'REPLACED', 'REJECTED', 'RETURNED') NOT NULL DEFAULT 'RECEIVED',
    `resolution` TEXT NULL,
    `replacementSerial` VARCHAR(120) NULL,
    `outOfWarranty` BOOLEAN NOT NULL DEFAULT false,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdById` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WarrantyClaim_saleItemId_idx`(`saleItemId`),
    INDEX `WarrantyClaim_storeId_status_idx`(`storeId`, `status`),
    UNIQUE INDEX `WarrantyClaim_storeId_ticketNo_key`(`storeId`, `ticketNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordReset` ADD CONSTRAINT `PasswordReset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Counter` ADD CONSTRAINT `Counter_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Warehouse` ADD CONSTRAINT `Warehouse_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLevel` ADD CONSTRAINT `StockLevel_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLevel` ADD CONSTRAINT `StockLevel_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductUnit` ADD CONSTRAINT `ProductUnit_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductUnit` ADD CONSTRAINT `ProductUnit_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductUnit` ADD CONSTRAINT `ProductUnit_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerLedger` ADD CONSTRAINT `CustomerLedger_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerLedger` ADD CONSTRAINT `CustomerLedger_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_productUnitId_fkey` FOREIGN KEY (`productUnitId`) REFERENCES `ProductUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `SaleItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
