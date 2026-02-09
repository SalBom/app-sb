
import { useMemo } from 'react';

type Factura = {
  amount_total: number;
  invoice_date: string;
  partner_id: number;
};

type Cliente = {
  id: number;
  name: string;
};

export const useKpiFromFacturas = (
  facturas: Factura[],
  clientes: Cliente[]
) => {
  return useMemo(() => {
    try {
      console.log("📥 Entrando a useKpiFromFacturas");
      console.log("🧾 Facturas recibidas:", facturas);
      console.log("👥 Clientes recibidos:", clientes);

      // Validaciones
      facturas.forEach((f, idx) => {
        if (typeof f.partner_id !== 'number') {
          console.warn(`⚠️ Factura[${idx}].partner_id no es número:`, f.partner_id);
        }
      });

      clientes.forEach((c, idx) => {
        if (typeof c.id !== 'number') {
          console.warn(`⚠️ Cliente[${idx}].id inválido:`, c);
        }
      });

      const ahora = new Date();
      const mesActual = ahora.getMonth();
      const añoActual = ahora.getFullYear();

      const facturasDelMes = facturas.filter((f) => {
        const fecha = new Date(f.invoice_date);
        return (
          fecha.getMonth() === mesActual &&
          fecha.getFullYear() === añoActual
        );
      });

      const total_facturado_mes = facturasDelMes.reduce(
        (acc, f) => acc + (f.amount_total || 0),
        0
      );

      const clienteIdsDelMes = new Set(
        facturasDelMes.map((f) => f.partner_id)
      );

      const clienteIdsActuales = new Set(clientes.map((c) => c.id));

      const clientes_nuevos = Array.from(clienteIdsDelMes).filter(
        (id) => !clienteIdsActuales.has(id)
      ).length;

      const todosClienteIds = new Set(facturas.map((f) => f.partner_id));

      const clientes_perdidos = Array.from(clienteIdsActuales).filter(
        (id) => !todosClienteIds.has(id)
      ).length;

      const resultado = {
        total_facturado_mes,
        clientes_nuevos,
        clientes_perdidos,
      };

      console.log("✅ Resultado KPI:", resultado);
      return resultado;
    } catch (error) {
      console.error("❌ Error en useKpiFromFacturas:", error);
      return {
        total_facturado_mes: 0,
        clientes_nuevos: 0,
        clientes_perdidos: 0,
      };
    }
  }, [facturas, clientes]);
};
