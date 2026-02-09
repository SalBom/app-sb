
type Cliente = {
  id: number;
  name: string;
  vat?: string;
};

type Factura = {
  amount_total: number;
  invoice_date: string;
  partner_id: number;
};

type Clasificados = {
  activos: Cliente[];
  riesgo_medio: Cliente[];
  riesgo_alto: Cliente[];
  perdidos: Cliente[];
};

export function clasificarClientes(clientes: Cliente[], facturas: Factura[]): Clasificados {
  const ahora = new Date();
  const ultimasCompras = new Map<number, Date>();

  facturas.forEach((f) => {
    const clienteId = f.partner_id;
    const fechaFactura = new Date(f.invoice_date);
    const actual = ultimasCompras.get(clienteId);

    if (!actual || fechaFactura > actual) {
      ultimasCompras.set(clienteId, fechaFactura);
    }
  });

  console.log("📊 Comparando clientes con facturas:", {
    totalClientes: clientes.length,
    totalFacturas: facturas.length,
    idsClientes: clientes.map(c => c.id),
    idsFacturas: facturas.map(f => f.partner_id),
  });

  const resultado: Clasificados = {
    activos: [],
    riesgo_medio: [],
    riesgo_alto: [],
    perdidos: [],
  };

  clientes.forEach((cliente) => {
    const ultimaCompra = ultimasCompras.get(cliente.id);

    if (!ultimaCompra) {
      console.log(`❌ Cliente ${cliente.id} (${cliente.name}) SIN COMPRAS`);
      resultado.perdidos.push(cliente);
      return;
    }

    const diferenciaMeses =
      (ahora.getFullYear() - ultimaCompra.getFullYear()) * 12 +
      (ahora.getMonth() - ultimaCompra.getMonth());

    console.log(`📅 Cliente ${cliente.id} (${cliente.name}) - Última compra: ${ultimaCompra.toISOString().split("T")[0]} - Hace ${diferenciaMeses} meses`);

    if (diferenciaMeses <= 1) {
      resultado.activos.push(cliente);
    } else if (diferenciaMeses === 2) {
      resultado.riesgo_medio.push(cliente);
    } else if (diferenciaMeses === 3 || diferenciaMeses === 4) {
      resultado.riesgo_alto.push(cliente);
    } else if (diferenciaMeses >= 5) {
      resultado.perdidos.push(cliente);
    }
  });

  console.log("📊 Resultado clasificador:", {
    activos: resultado.activos.length,
    riesgo_medio: resultado.riesgo_medio.length,
    riesgo_alto: resultado.riesgo_alto.length,
    perdidos: resultado.perdidos.length,
  });

  return resultado;
}
