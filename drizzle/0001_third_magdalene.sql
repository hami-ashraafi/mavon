CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`version` integer NOT NULL,
	`platform_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`username` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credentials_email_unique` ON `credentials` (`email`);--> statement-breakpoint
CREATE TABLE `live_commits` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_commits_revision_unique` ON `live_commits` (`revision`);--> statement-breakpoint
CREATE TABLE `live_workspace` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`until` integer NOT NULL
);
