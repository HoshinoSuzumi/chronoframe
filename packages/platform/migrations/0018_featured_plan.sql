ALTER TABLE platform_plans ADD COLUMN featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN(0,1));
CREATE UNIQUE INDEX platform_plans_one_featured ON platform_plans(featured) WHERE featured=1;
