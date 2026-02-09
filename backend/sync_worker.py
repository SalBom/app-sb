"""
Sincroniza incrementales desde Odoo a Postgres.
Ejecutar como Worker/Cron en Render.
"""
import os, time
from odooly import Client
from db import upsert_products, upsert_partners

SERVER = (os.getenv("ODOO_SERVER") or "").rstrip("/") + "/"
DB     = os.getenv("ODOO_DB")
USER   = os.getenv("ODOO_USER")
PWD    = os.getenv("ODOO_PASSWORD")

def _odoo_client():
    c = Client(SERVER)
    c.login(USER, PWD, DB)  # API key como password
    return c

def sync_products(limit=500, sleep=0.1):
    c = _odoo_client()
    model = c.env["product.product"]
    fields = ["id","default_code","name","x_brand","categ_id","lst_price","currency_id","qty_available"]
    offset = 0
    total = 0
    while True:
        rows = model.search_read([], fields=fields, limit=limit, offset=offset)
        if not rows:
            break
        mapped = []
        for r in rows:
            mapped.append({
                "id": r["id"],
                "default_code": r.get("default_code"),
                "name": r.get("name"),
                "brand": (r.get("x_brand") or False) and (r["x_brand"][1] if isinstance(r["x_brand"], (list,tuple)) else r["x_brand"]),
                "category": (r.get("categ_id") or False) and (r["categ_id"][1] if isinstance(r["categ_id"], (list,tuple)) else r["categ_id"]),
                "price_list": r.get("lst_price"),
                "currency": (r.get("currency_id") or False) and (r["currency_id"][1] if isinstance(r["currency_id"], (list,tuple)) else r["currency_id"]),
                "stock_qty": r.get("qty_available"),
            })
        total += upsert_products(mapped)
        offset += limit
        time.sleep(sleep)
    return total

def sync_partners(limit=500, sleep=0.1):
    c = _odoo_client()
    model = c.env["res.partner"]
    fields = ["id","name","vat","email","phone","user_id"]
    offset = 0
    total = 0
    while True:
        rows = model.search_read([("customer_rank", ">", 0)], fields=fields, limit=limit, offset=offset)
        if not rows:
            break
        mapped = []
        for r in rows:
            mapped.append({
                "id": r["id"],
                "name": r.get("name"),
                "vat": r.get("vat"),
                "email": r.get("email"),
                "phone": r.get("phone"),
                "salesperson_id": (r.get("user_id") or False) and (r["user_id"][0] if isinstance(r["user_id"], (list,tuple)) else r["user_id"]),
            })
        total += upsert_partners(mapped)
        offset += limit
        time.sleep(sleep)
    return total

if __name__ == "__main__":
    p = sync_products()
    t = sync_partners()
    print({"synced_products": p, "synced_partners": t})
