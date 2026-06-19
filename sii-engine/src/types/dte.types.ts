export enum TipoDTE {
  FacturaElectronica = 33,
  FacturaNoAfectaExentaElectronica = 34,
  BoletaElectronica = 39,
  BoletaNoAfectaExentaElectronica = 41,
  FacturaCompraElectronica = 46,
  GuiaDespachoElectronica = 52,
  NotaDebito = 56,
  NotaCredito = 61,
}

export enum FormaPago {
  Contado = 1,
  Credito = 2,
  SinCosto = 3,
}

export enum TipoDespacho {
  PorCuentaDelEmisor = 1,
  PorCuentaDelReceptor = 2,
  DespachoExterno = 3,
}

export enum IndTraslado {
  OperacionConstituyeVentaExportacion = 1,
  VentasPropiasNoConsignacion = 2,
  ConsignacionesNoVentaPropias = 3,
  EntregasGratuitasNoVenta = 4,
  TrasladosInternosBienPropios = 5,
  OtrosTraslados = 6,
}

export enum TipoReferencia {
  AnulaDocumento = 1,
  CorrigeTextoDocumento = 2,
  CorrigeMontosDocumento = 3,
}

export interface IdDoc {
  tipoDTE: TipoDTE;
  folio: number;
  fechaEmision: string;
  indMntNeto?: 1 | 2;
  tipoDespacho?: TipoDespacho;
  indTraslado?: IndTraslado;
  formaPago?: FormaPago;
  fechaVencimiento?: string;
  medioPago?: string;
  termPagoCdg?: string;
  termPagoDias?: number;
  termPagoGlosa?: string;
}

export interface Emisor {
  rutEmisor: string;
  rznSoc: string;
  giroEmis: string;
  telefono?: string;
  correoEmisor?: string;
  acteco: number;
  cdgSIISucur?: string;
  dirOrigen: string;
  cmnaOrigen: string;
  ciudadOrigen?: string;
}

export interface Receptor {
  rutRecep: string;
  rznSocRecep: string;
  giroRecep?: string;
  contacto?: string;
  correoRecep?: string;
  dirRecep?: string;
  cmnaRecep?: string;
  ciudadRecep?: string;
  extranjero?: boolean;
}

export interface DetalleDTE {
  nroLinDet: number;
  nmbItem: string;
  dscItem?: string;
  qtyItem?: number;
  unmdItem?: string;
  prcItem: number;
  descuentoPct?: number;
  descuentoMnt?: number;
  recargoPct?: number;
  recargoMnt?: number;
  montoItem: number;
  indExe?: 1 | 2;
  codItem?: string;
  tipoCodigo?: string;
}

export interface DscRcgGlobal {
  nroLinDR: number;
  tipoMov: "D" | "R";
  glosaDR: string;
  TpoDR: "%" | "$";
  ValDR: number;
}

export interface Referencia {
  nroLinRef: number;
  tipoDTERef?: TipoDTE | string;
  indGlobal?: 1;
  folioRef?: number;
  rutOtro?: string;
  fechaRef?: string;
  codRef?: TipoReferencia;
  razonRef?: string;
}

export interface Totales {
  mntNeto?: number;
  mntExento?: number;
  tasaIVA?: number;
  iva?: number;
  ivaNoRet?: number;
  ivaUsoComun?: number;
  imptoReten?: ImpuestoRetencion[];
  mntBruto?: number;
  mntoNF?: number;
  mntTotal: number;
  mntPagos?: number;
}

export interface ImpuestoRetencion {
  tipoImp: number;
  tasaImp: number;
  montoImp: number;
}

export interface DteDocument {
  idDoc: IdDoc;
  emisor: Emisor;
  receptor: Receptor;
  detalles: DetalleDTE[];
  dscRcgGlobal?: DscRcgGlobal[];
  referencias?: Referencia[];
  totales: Totales;
}

export interface DteConTed {
  document: DteDocument;
  tedXml: string;
}

export interface DteFirmado {
  document: DteDocument;
  tedXml: string;
  signedXml: string;
}
