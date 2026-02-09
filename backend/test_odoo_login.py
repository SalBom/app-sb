# test_odoo_login.py
from odooly import Client
SERVER="https://train-salbom-18-07-2.adhoc.ar/"
DB     ="train-salbom-18-07-2"
USER   ="m.estevez@sal-bom.com.ar"
APIKEY ="a63b1376dd05ed0423383b4bb40fc17a90131182"

c = Client(SERVER)

# odooly antiguo: API key va como 'password' y DB como 3er parámetro posicional
c.login(USER, APIKEY, DB)

# Si llegaste aquí sin excepción, el login fue OK.
print("Login OK")

# Alternativas a 'client.uid'
try:
    print("env.uid:", c.env.uid)
except Exception:
    pass

try:
    me = c.env['res.users'].search_read([('login', '=', USER)], ['id','name','login'], limit=1)
    print("Yo:", me)
except Exception as e:
    print("users read error:", e)

# Ping simple
print("Versión:", c.version)
print("Usuarios totales:", c.env['res.users'].search_count([]))