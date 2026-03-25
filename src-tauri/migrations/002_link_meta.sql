-- Migration: 002_link_meta.sql
-- Description: 添加 link 类型的元数据字段
ALTER TABLE records ADD COLUMN link_title TEXT;
ALTER TABLE records ADD COLUMN link_domain TEXT;
ALTER TABLE records ADD COLUMN link_og_image TEXT;
ALTER TABLE records ADD COLUMN link_favicon TEXT;
