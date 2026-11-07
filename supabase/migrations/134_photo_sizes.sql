-- Photos on forms (docs/forms-media-plan.md): an uploaded picture is also kept in WebP at 640, 1280 and 1920 wide
-- (only the widths smaller than the picture), beside the original in the "assets" bucket as <id>-<width>.webp.
-- A form's photo names the widths it has (data-cl-sizes) and loads the one that fits. Run after 133. Safe to run
-- more than once.

alter table public.design_assets add column if not exists sizes int[] not null default '{}';
alter table public.design_assets drop constraint if exists design_assets_sizes_ok;
alter table public.design_assets add constraint design_assets_sizes_ok check (sizes <@ array[640, 1280, 1920]);
