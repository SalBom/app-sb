-- Esquema mínimo (ajusta columnas según tus pantallas)
create table if not exists products (
  id              bigint primary key,
  default_code    text,
  name            text not null,
  brand           text,
  category        text,
  price_list      numeric(14,2),
  currency        text,
  stock_qty       numeric(14,2),
  last_update_utc timestamptz not null default now()
);
create table if not exists partners (
  id              bigint primary key,
  name            text not null,
  vat             text,
  email           text,
  phone           text,
  salesperson_id  bigint,
  last_update_utc timestamptz not null default now()
);
create index if not exists idx_products_name on products using gin (to_tsvector('simple', name));
create index if not exists idx_products_default_code on products (default_code);
create index if not exists idx_partners_vat on partners (vat);
