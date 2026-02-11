import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "https://app-salbom-production.up.railway.app", // Cambialo si usás .env
  timeout: 5000,
  headers: {
    "Content-Type": "application/json",
  },
});

interface FacturaPDFResponse {
  pdf_url: string;
}

export const fetchFacturaPDF = async (facturaId: string): Promise<FacturaPDFResponse> => {
  const url = `/factura_pdf?facturaId=${facturaId}`;
  const response = await axiosInstance.get<FacturaPDFResponse>(url);
  return response.data;
};

export default axiosInstance;
