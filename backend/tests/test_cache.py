import importlib.util
import sys
import types
import json
import pytest

class FakeRedis:
    def __init__(self):
        self.store = {}
        self.ttl = {}
    def get(self, key):
        return self.store.get(key)
    def setex(self, key, ttl, value):
        self.store[key] = value
        self.ttl[key] = ttl


def load_main(monkeypatch, fake_redis):
    flask_stub = types.ModuleType('flask')
    class FlaskStub:
        def __init__(self, *a, **kw):
            pass
        def route(self, *a, **kw):
            def decorator(fn):
                return fn
            return decorator
    flask_stub.Flask = FlaskStub
    flask_stub.request = types.SimpleNamespace(args={})
    flask_stub.jsonify = lambda x: x
    flask_stub.Response = object

    flask_cors_stub = types.ModuleType('flask_cors')
    flask_cors_stub.CORS = lambda *a, **kw: None

    odooly_stub = types.ModuleType('odooly')
    odooly_stub.Client = lambda *a, **kw: types.SimpleNamespace(login=lambda *a, **kw: None, env={})

    redis_stub = types.ModuleType('redis')
    redis_stub.Redis = types.SimpleNamespace(from_url=lambda url: fake_redis)

    monkeypatch.setitem(sys.modules, 'flask', flask_stub)
    monkeypatch.setitem(sys.modules, 'flask_cors', flask_cors_stub)
    monkeypatch.setitem(sys.modules, 'odooly', odooly_stub)
    monkeypatch.setitem(sys.modules, 'redis', redis_stub)

    spec = importlib.util.spec_from_file_location('backend.main', 'backend/main.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def main_module(monkeypatch):
    fake_redis = FakeRedis()
    module = load_main(monkeypatch, fake_redis)
    yield module, fake_redis
    sys.modules.pop('backend.main', None)


def test_get_cache_or_execute_caches_result(main_module):
    module, fake = main_module

    calls = []
    def fb():
        calls.append(True)
        return {'v': 1}

    result1 = module.get_cache_or_execute('k', ttl=10, fallback_fn=fb)
    assert result1 == {'v': 1}
    assert calls == [True]
    assert fake.store['k'] == json.dumps({'v': 1})
    assert fake.ttl['k'] == 10

    result2 = module.get_cache_or_execute('k', ttl=10, fallback_fn=fb)
    assert result2 == {'v': 1}
    assert calls == [True]
