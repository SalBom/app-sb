export const getFacturasPorCuit = async (cuit: string) => {
  try {
    console.log(`📡 Solicitando facturas para CUIT: ${cuit}...`);

    const response = await fetch(
      `https://app-salbom-production.up.railway.app/facturas?cuit=${cuit}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error en la API: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("✅ Facturas obtenidas:", data);

    return data;
  } catch (error) {
    console.error("❌ Error en getFacturasPorCuit:", error);
    throw new Error(`No se pudieron obtener las facturas. ${error}`);
  }
};

// 🚀 Nueva función para obtener productos filtrados por "Linea"
export const getProductosLinea = async () => {
  try {
    console.log("📡 Solicitando productos con categoría 'Linea'...");

    const response = await fetch("https://app-salbom-production.up.railway.app/productos", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error en la API: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 🔍 Evitar que la consola se llene con base64
    const dataReducida = data.map((producto: any) => ({
      ...producto,
      image_1920: producto.image_1920 ? "Imagen Base64 (recortada)" : null,
    }));

    console.log("✅ Productos obtenidos:", dataReducida);

    return data;
  } catch (error) {
    console.error("❌ Error en getProductosLinea:", error);
    throw new Error(`No se pudieron obtener los productos. ${error}`);
  }
};

export const getMisVentasPorCuit = async (cuit: string) => {
  try {
    console.log(`📡 Solicitando ventas para CUIT: ${cuit}...`);

    const response = await fetch(
      `https://app-salbom-production.up.railway.app/mis_ventas?cuit=${cuit}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error en la API: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("✅ Ventas obtenidas:", data);

    return data;
  } catch (error) {
    console.error("❌ Error en getMisVentasPorCuit:", error);
    throw new Error(`No se pudieron obtener las ventas. ${error}`);
  }
};
