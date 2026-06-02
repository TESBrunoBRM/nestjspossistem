https://www.sii.cl/servicios_online/3532-formato_xml-3811.html

Formato XML de Documentos Electrónicos
En esta opción podrá acceder a archivos que contiene la especificación del schema XML y diagrama de visualización del schema XML de Documentos Tributarios Electrónicos, Información Electrónica de Compras y Ventas e Intercambio entre Contribuyentes.


Uso de XML en la Factura Electrónica

El Servicio de Impuestos Internos ha decidido que el formato en que se generarán los documentos tributarios electrónicos sea XML o Lenguaje Extensible de "Etiquetado", eXtensible Markup Language. Este metalenguaje proporciona una forma de aplicar etiquetas para describir las partes que componen un documento, permitiendo además el intercambio de documentos entre diferentes plataformas. 

La versión 1.0 del lenguaje XML es una recomendación del W3C (W3 Consortium) desde Febrero de 1998, pero está basado en estándares anteriores como SGML (Standard Generalized Markup Language, ISO 8879). 

El formato estándar “Extensible Markup Language (XML), tiene varias características que lo hacen conveniente, entre las que podemos destacar:

Es un estándar abierto, flexible y ampliamente utilizado para almacenar, publicar e intercambiar cualquier tipo de información.

Ofrece portabilidad y utilización de la información a través de las distintas plataformas (permite independizar aplicaciones de datos).

Es ampliamente soportado por diversas aplicaciones en distintas plataformas y existen múltiples bibliotecas para diversos lenguajes de programación, tanto gratis como comerciales, que permiten el desarrollo de nuevas aplicaciones.

Es un formato legible por personas y computadores.

La especificación de documentos XML es simple, rápida, precisa y concisa. 

Para mayores especificaciones de XML se sugiere visitar http://www.w3.org./

La especificación de formatos XML se hará a través de un schema XML almacenado en un archivo tipo ZIP (Comprimido). La documentación con el diagrama de los schema XML está contenido en un conjunto de archivos comprimidos.

Antes de hacer cualquier envío de información al SII es muy conveniente chequear que el archivo que se desea enviar es un documento XML bien formado y que dicho archivo cumple con el schema XML definido por el SII. En Internet se puede encontrar gran cantidad de herramientas que permiten validar el schema XML ya sea en modalidad local o en línea.

IMPORTANTE:

- Con respecto a los archivos schema, una vez descomprimida la información, debe abrir el archivo ".xsd" con su browser (Internet Explorer, Netscape Navigator u otro).

- En el caso del schema de los Documentos Tributarios Electrónicos, el schema ha sido dividido en 4 archivos “xsd”, cuyo contenido es el siguiente:

EnvioDTE_v10.xsd (xsd principal y que incluye a los 3 siguientes)
DTE_v10.xsd (xsd con la descripción de documentos)
SiiTypes_v10.xsd (xsd con la descripción de tipos de datos)
xmldsignature_v10.xsd (xsd con la descripción de la firma electrónica)
Para validar correctamente que un envío de DTE cumple con el schema XML definido, se debe contar con los 4 archivos indicados anteriormente.

- Con respecto a los diagramas, una vez descomprimida la información, debe abrir el archivo ".html"