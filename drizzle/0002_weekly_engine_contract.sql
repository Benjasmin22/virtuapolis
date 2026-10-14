ALTER TYPE "public"."account_kind" ADD VALUE 'SUPPLIER_CASH';--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_owner";--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT "companies_nonnegative";--> statement-breakpoint
ALTER TABLE "turn_runs" DROP CONSTRAINT "turn_runs_completion";--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "bakery_elasticity_bps" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "sales_tax_bps" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "reference_price_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "weekly_bread_units" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner" CHECK ((
    ("accounts"."kind" = 'HOUSEHOLD_CASH' AND "accounts"."household_id" IS NOT NULL AND "accounts"."company_id" IS NULL) OR
    ("accounts"."kind" = 'COMPANY_CASH' AND "accounts"."company_id" IS NOT NULL AND "accounts"."household_id" IS NULL) OR
    ("accounts"."kind" IN ('TREASURY', 'OPENING_EQUITY', 'SUPPLIER_CASH') AND "accounts"."household_id" IS NULL AND "accounts"."company_id" IS NULL)
  ));--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_rates_bounded" CHECK ("cities"."bakery_elasticity_bps" BETWEEN 0 AND 20000 AND "cities"."sales_tax_bps" BETWEEN 0 AND 10000);--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_nonnegative" CHECK ("companies"."price_cents" >= 0 AND "companies"."reference_price_cents" >= 0 AND "companies"."unit_cost_cents" >= 0 AND "companies"."weekly_wage_cents" >= 0 AND "companies"."capacity" >= 0 AND "companies"."employees" >= 0);--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_bread_nonnegative" CHECK ("households"."weekly_bread_units" >= 0);--> statement-breakpoint
ALTER TABLE "turn_runs" ADD CONSTRAINT "turn_runs_completion" CHECK (("turn_runs"."status" = 'COMPLETED') = ("turn_runs"."completed_at" IS NOT NULL AND "turn_runs"."report" IS NOT NULL));