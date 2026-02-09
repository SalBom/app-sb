import os
from contextlib import contextmanager
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL,
    pool_size=3, max_overflow=2, pool_pre_ping=True,
    pool_recycle=1800, future=True
)

@contextmanager
def db_session():
    with engine.begin() as conn:
        yield conn

def upsert_products(rows):
    if not rows:
        return 0
    cols = ["id","default_code","name","brand","category","price_list","currency","stock_qty"]
    values = [{k: r.get(k) for k in cols} for r in rows]
    sql = text("""
        insert into products (id, default_code, name, brand, category, price_list, currency, stock_qty, last_update_utc)
        values (:id, :default_code, :name, :brand, :category, :price_list, :currency, :stock_qty, now())
        on conflict (id) do update set
          default_code = excluded.default_code,
          name         = excluded.name,
          brand        = excluded.brand,
          category     = excluded.category,
          price_list   = excluded.price_list,
          currency     = excluded.currency,
          stock_qty    = excluded.stock_qty,
          last_update_utc = now();
    """)
    with db_session() as conn:
        conn.execute(sql, values)
    return len(values)

def upsert_partners(rows):
    if not rows:
        return 0
    cols = ["id","name","vat","email","phone","salesperson_id"]
    values = [{k: r.get(k) for k in cols} for r in rows]
    sql = text("""
        insert into partners (id, name, vat, email, phone, salesperson_id, last_update_utc)
        values (:id, :name, :vat, :email, :phone, :salesperson_id, now())
        on conflict (id) do update set
          name = excluded.name,
          vat  = excluded.vat,
          email= excluded.email,
          phone= excluded.phone,
          salesperson_id = excluded.salesperson_id,
          last_update_utc = now();
    """)
    with db_session() as conn:
        conn.execute(sql, values)
    return len(values)

def fetch_products(q=None, limit=50, offset=0):
    where = ""
    params = {"limit": limit, "offset": offset}
    if q:
        where = "where name ilike :q or default_code ilike :q"
        params["q"] = f"%{q}%"
    sql = text(f"""
        select id, default_code, name, brand, category, price_list, currency, stock_qty
        from products
        {where}
        order by name asc
        limit :limit offset :offset
    """)
    with db_session() as conn:
        res = conn.execute(sql, params).mappings().all()
    return [dict(r) for r in res]
