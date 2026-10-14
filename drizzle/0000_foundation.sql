CREATE TYPE "public"."account_kind" AS ENUM('HOUSEHOLD_CASH', 'COMPANY_CASH', 'TREASURY', 'OPENING_EQUITY');--> statement-breakpoint
CREATE TYPE "public"."building_kind" AS ENUM('RESIDENCE', 'BAKERY', 'BANK', 'CITY_HALL');--> statement-breakpoint
CREATE TYPE "public"."city_kind" AS ENUM('MAIN', 'LAB');--> statement-breakpoint
CREATE TYPE "public"."entry_side" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."experiment_kind" AS ENUM('INTEREST_CREDIT', 'BAKERY_COST', 'PUBLIC_BUDGET');--> statement-breakpoint
CREATE TYPE "public"."scenario_status" AS ENUM('READY', 'COMPLETED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."transaction_nature" AS ENUM('OPENING', 'PURCHASE', 'WAGE', 'TAX', 'TRANSFER', 'LOAN', 'REPAYMENT', 'INTEREST');--> statement-breakpoint
CREATE TYPE "public"."turn_status" AS ENUM('PENDING', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" "account_kind" NOT NULL,
	"household_id" uuid,
	"company_id" uuid,
	CONSTRAINT "accounts_scoped_key" UNIQUE("city_id","id"),
	CONSTRAINT "accounts_code_key" UNIQUE("city_id","code"),
	CONSTRAINT "accounts_household_key" UNIQUE("city_id","household_id"),
	CONSTRAINT "accounts_company_key" UNIQUE("city_id","company_id"),
	CONSTRAINT "accounts_owner" CHECK ((
    ("accounts"."kind" = 'HOUSEHOLD_CASH' AND "accounts"."household_id" IS NOT NULL AND "accounts"."company_id" IS NULL) OR
    ("accounts"."kind" = 'COMPANY_CASH' AND "accounts"."company_id" IS NOT NULL AND "accounts"."household_id" IS NULL) OR
    ("accounts"."kind" IN ('TREASURY', 'OPENING_EQUITY') AND "accounts"."household_id" IS NULL AND "accounts"."company_id" IS NULL)
  ))
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"kind" "building_kind" NOT NULL,
	"name" text NOT NULL,
	"grid_x" integer NOT NULL,
	"grid_y" integer NOT NULL,
	CONSTRAINT "buildings_scoped_key" UNIQUE("city_id","id","kind"),
	CONSTRAINT "buildings_grid_key" UNIQUE("city_id","grid_x","grid_y"),
	CONSTRAINT "buildings_grid_nonnegative" CHECK ("buildings"."grid_x" >= 0 AND "buildings"."grid_y" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT 'Nova Aurora' NOT NULL,
	"kind" "city_kind" DEFAULT 'MAIN' NOT NULL,
	"current_turn" integer DEFAULT 0 NOT NULL,
	"engine_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cities_owner_kind_key" UNIQUE("id","user_id","kind"),
	CONSTRAINT "cities_turn_nonnegative" CHECK ("cities"."current_turn" >= 0)
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"kind" "building_kind" NOT NULL,
	"name" text NOT NULL,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"weekly_wage_cents" bigint DEFAULT 0 NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"employees" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "companies_scoped_key" UNIQUE("city_id","id"),
	CONSTRAINT "companies_building_key" UNIQUE("city_id","building_id"),
	CONSTRAINT "companies_kind" CHECK ("companies"."kind" IN ('BAKERY', 'BANK')),
	CONSTRAINT "companies_nonnegative" CHECK ("companies"."price_cents" >= 0 AND "companies"."unit_cost_cents" >= 0 AND "companies"."weekly_wage_cents" >= 0 AND "companies"."capacity" >= 0 AND "companies"."employees" >= 0)
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"building_kind" "building_kind" DEFAULT 'RESIDENCE' NOT NULL,
	"name" text NOT NULL,
	"members" integer DEFAULT 1 NOT NULL,
	"workers" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "households_scoped_key" UNIQUE("city_id","id"),
	CONSTRAINT "households_building_key" UNIQUE("city_id","building_id"),
	CONSTRAINT "households_residence" CHECK ("households"."building_kind" = 'RESIDENCE'),
	CONSTRAINT "households_population" CHECK ("households"."members" > 0 AND "households"."workers" BETWEEN 0 AND "households"."members")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"transaction_id" uuid NOT NULL,
	"city_id" uuid NOT NULL,
	"side" "entry_side" NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "ledger_entries_transaction_id_side_pk" PRIMARY KEY("transaction_id","side"),
	CONSTRAINT "ledger_entries_positive" CHECK ("ledger_entries"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"turn" integer NOT NULL,
	"event_key" text NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"nature" "transaction_nature" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_scoped_key" UNIQUE("city_id","id"),
	CONSTRAINT "ledger_transactions_event_key" UNIQUE("city_id","turn","event_key"),
	CONSTRAINT "ledger_transactions_positive" CHECK ("ledger_transactions"."amount_cents" > 0),
	CONSTRAINT "ledger_transactions_distinct_accounts" CHECK ("ledger_transactions"."source_account_id" <> "ledger_transactions"."destination_account_id")
);
--> statement-breakpoint
CREATE TABLE "scenario_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"base_city_id" uuid NOT NULL,
	"base_city_kind" "city_kind" DEFAULT 'MAIN' NOT NULL,
	"fork_city_id" uuid NOT NULL,
	"fork_city_kind" "city_kind" DEFAULT 'LAB' NOT NULL,
	"base_turn" integer NOT NULL,
	"experiment" "experiment_kind" NOT NULL,
	"interest_delta_bps" integer DEFAULT 0 NOT NULL,
	"cost_shock_bps" integer DEFAULT 0 NOT NULL,
	"public_budget_delta_cents" bigint DEFAULT 0 NOT NULL,
	"status" "scenario_status" DEFAULT 'READY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_runs_fork_city_id_unique" UNIQUE("fork_city_id"),
	CONSTRAINT "scenario_runs_isolated" CHECK ("scenario_runs"."base_city_id" <> "scenario_runs"."fork_city_id" AND "scenario_runs"."base_city_kind" = 'MAIN' AND "scenario_runs"."fork_city_kind" = 'LAB'),
	CONSTRAINT "scenario_runs_turn_nonnegative" CHECK ("scenario_runs"."base_turn" >= 0),
	CONSTRAINT "scenario_runs_cost_floor" CHECK ("scenario_runs"."cost_shock_bps" >= -10000)
);
--> statement-breakpoint
CREATE TABLE "turn_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"turn" integer NOT NULL,
	"request_key" text NOT NULL,
	"status" "turn_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "turn_runs_week_key" UNIQUE("city_id","turn"),
	CONSTRAINT "turn_runs_request_key" UNIQUE("city_id","request_key"),
	CONSTRAINT "turn_runs_nonnegative" CHECK ("turn_runs"."turn" >= 0),
	CONSTRAINT "turn_runs_completion" CHECK (("turn_runs"."status" = 'COMPLETED') = ("turn_runs"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_city_id_household_id_households_city_id_id_fk" FOREIGN KEY ("city_id","household_id") REFERENCES "public"."households"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_city_id_company_id_companies_city_id_id_fk" FOREIGN KEY ("city_id","company_id") REFERENCES "public"."companies"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_city_id_building_id_kind_buildings_city_id_id_kind_fk" FOREIGN KEY ("city_id","building_id","kind") REFERENCES "public"."buildings"("city_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_city_id_building_id_building_kind_buildings_city_id_id_kind_fk" FOREIGN KEY ("city_id","building_id","building_kind") REFERENCES "public"."buildings"("city_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_city_id_transaction_id_ledger_transactions_city_id_id_fk" FOREIGN KEY ("city_id","transaction_id") REFERENCES "public"."ledger_transactions"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_city_id_account_id_accounts_city_id_id_fk" FOREIGN KEY ("city_id","account_id") REFERENCES "public"."accounts"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_city_id_turn_turn_runs_city_id_turn_fk" FOREIGN KEY ("city_id","turn") REFERENCES "public"."turn_runs"("city_id","turn") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_city_id_source_account_id_accounts_city_id_id_fk" FOREIGN KEY ("city_id","source_account_id") REFERENCES "public"."accounts"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_city_id_destination_account_id_accounts_city_id_id_fk" FOREIGN KEY ("city_id","destination_account_id") REFERENCES "public"."accounts"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_runs" ADD CONSTRAINT "scenario_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_runs" ADD CONSTRAINT "scenario_runs_base_city_id_user_id_base_city_kind_cities_id_user_id_kind_fk" FOREIGN KEY ("base_city_id","user_id","base_city_kind") REFERENCES "public"."cities"("id","user_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_runs" ADD CONSTRAINT "scenario_runs_fork_city_id_user_id_fork_city_kind_cities_id_user_id_kind_fk" FOREIGN KEY ("fork_city_id","user_id","fork_city_kind") REFERENCES "public"."cities"("id","user_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD CONSTRAINT "turn_runs_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cities_owner_idx" ON "cities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("city_id","account_id");