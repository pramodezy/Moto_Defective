-- Migration: Correct CRM status for "Not Return" consignments and sanitize legacy "AWB Pending"
-- Date: 2026-09-17

-- 1. Where motorola_status is "Not Return", set crm_status strictly to "CCI to Create DC"
UPDATE shipping_orders
SET crm_status = 'CCI to Create DC'
WHERE LOWER(motorola_status) LIKE '%not return%';

-- 2. Where legacy placeholder "AWB Pending" exists, standardize to valid "Pending AWB"
UPDATE shipping_orders
SET crm_status = 'Pending AWB'
WHERE crm_status = 'AWB Pending';
