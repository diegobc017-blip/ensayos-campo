// Lista de referencia de ingredientes activos usados en agricultura
// (intensiva/extensiva) y pasturas. Se usa para dos cosas:
//
//  1) Reconocer automáticamente qué ingrediente activo es un producto que
//     se escribe, se dicta por voz o se lee de una foto/planilla — para
//     priorizar el ingrediente activo por sobre el nombre comercial (que
//     suele ser una mezcla de varios activos).
//  2) Mostrar información de referencia (qué controla, en qué cultivos se
//     usa, dosis de referencia) como ayuda al cargar productos.
//
// Las dosis de referencia son orientativas (g i.a./ha) y pueden variar según
// región, condiciones y registro vigente — la dosis real de cada ensayo se
// carga aparte, por tratamiento.

export const INGREDIENTES_ACTIVOS = [
  { n: 1, grupo: '1-ACCasa', nombre: 'Sethoxydim', dosisRef: '192-288', controla: 'Gramíneas', cultivos: 'Soja, maní, algodón, chía, poroto, girasol' },
  { n: 2, grupo: '1-ACCasa', nombre: 'Cletodym', dosisRef: '324', controla: 'Gramíneas', cultivos: 'Soja, maní, algodón, girasol' },
  { n: 3, grupo: '1-ACCasa', nombre: 'Clodinafop', dosisRef: '36-48', controla: 'Gramíneas', cultivos: 'Trigo' },
  { n: 4, grupo: '1-ACCasa', nombre: 'Quizalofop', dosisRef: '60', controla: 'Gramíneas', cultivos: 'Soja, maní, algodón, girasol' },
  { n: 5, grupo: '1-ACCasa', nombre: 'Fluazifop', dosisRef: '188', controla: 'Gramíneas', cultivos: 'Soja, maní, algodón, girasol' },
  { n: 6, grupo: '1-ACCasa', nombre: 'Fenoxaprop', dosisRef: '74', controla: 'Gramíneas', cultivos: 'Trigo, arroz' },
  { n: 7, grupo: '1-ACCasa', nombre: 'Haloxyfop', dosisRef: '62-65', controla: 'Gramíneas', cultivos: 'Soja, maní, algodón, girasol' },
  { n: 8, grupo: '1-ACCasa', nombre: 'Diclofop', dosisRef: '602', controla: 'Gramíneas', cultivos: 'Soja, girasol' },
  { n: 9, grupo: '1-ACCasa', nombre: 'Cyhalofop', dosisRef: '315', controla: 'Gramíneas', cultivos: 'Arroz' },
  { n: 10, grupo: '1-ACCasa', nombre: 'Propaquizafop', dosisRef: '175', controla: 'Gramíneas', cultivos: 'Soja, girasol, Habilla, maní' },
  { n: 11, grupo: '1-ACCasa', nombre: 'Pinoxaden', dosisRef: '550', controla: 'Gramíneas', cultivos: 'Trigo' },
  { n: 12, grupo: '2-ALS', nombre: 'Metsulfuron', dosisRef: '6', controla: 'Hojas anchas', cultivos: 'Trigo, Soja STS' },
  { n: 13, grupo: '2-ALS', nombre: 'Iodosulfuron', dosisRef: '3', controla: 'Gramíneas+Latifoliadas', cultivos: 'Trigo' },
  { n: 14, grupo: '2-ALS', nombre: 'Mesosulfuron', dosisRef: '12', controla: 'Principalmente gramíneas', cultivos: 'Trigo' },
  { n: 15, grupo: '2-ALS', nombre: 'Nicosulfuron', dosisRef: '40', controla: 'Gramíneas+algunas Latifoliadas', cultivos: 'Maíz' },
  { n: 16, grupo: '2-ALS', nombre: 'Florasulam', dosisRef: '5', controla: 'Latifoliadas', cultivos: 'Trigo' },
  { n: 17, grupo: '2-ALS', nombre: 'Pyroxsulam', dosisRef: '22', controla: 'Gramíneas+hojas anchas', cultivos: 'Trigo' },
  { n: 18, grupo: '2-ALS', nombre: 'Penoxsulam', dosisRef: '48', controla: 'Gramíneas+ciperáceas+hojas anchas', cultivos: 'Arroz' },
  { n: 19, grupo: '2-ALS', nombre: 'Bispyribac', dosisRef: '45', controla: 'Gramíneas+ciperáceas', cultivos: 'Arroz' },
  { n: 20, grupo: '2-ALS', nombre: 'Flucarbazone', dosisRef: '22', controla: 'Gramíneas', cultivos: 'Trigo' },
  { n: 21, grupo: '2-ALS', nombre: 'Clorimuron', dosisRef: '13', controla: 'Latifoliadas', cultivos: 'Soja, poroto' },
  { n: 22, grupo: '2-ALS', nombre: 'Diclosulam', dosisRef: '32', controla: 'Latifoliadas', cultivos: 'Soja, poroto' },
  { n: 23, grupo: '2-ALS', nombre: 'Flumetsulam', dosisRef: '120', controla: 'Latifoliadas', cultivos: 'Soja, maíz' },
  { n: 24, grupo: '2-ALS', nombre: 'Cloransulam', dosisRef: '50', controla: 'Latifoliadas', cultivos: 'Soja' },
  { n: 25, grupo: '2-ALS', nombre: 'Imazetapyr', dosisRef: '100', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, maní' },
  { n: 26, grupo: '2-ALS', nombre: 'Imazapic', dosisRef: '84', controla: 'Gramíneas+Latifoliadas', cultivos: 'Maní' },
  { n: 27, grupo: '2-ALS', nombre: 'Imazapir', dosisRef: '80', controla: 'Gramíneas+Latifoliadas', cultivos: 'Girasol Clearfield, Arroz Clearfield' },
  { n: 28, grupo: '2-ALS', nombre: 'Imazaquin', dosisRef: '150', controla: 'Latifoliadas', cultivos: 'Soja' },
  { n: 29, grupo: '3-Fotosistema II', nombre: 'Simazina', dosisRef: '2.250', controla: 'Gramíneas+Latifoliadas', cultivos: 'Maíz y usos según registro' },
  { n: 30, grupo: '3-Fotosistema II', nombre: 'Prometrina', dosisRef: '150', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Algodón, soja, girasol' },
  { n: 31, grupo: '3-Fotosistema II', nombre: 'Ametrina', dosisRef: '2.400', controla: 'Gramíneas+hojas anchas', cultivos: 'Caña de azúcar' },
  { n: 32, grupo: '3-Fotosistema II', nombre: 'Metribuzin', dosisRef: '480', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Soja, papa' },
  { n: 33, grupo: '3-Fotosistema II', nombre: 'Terbutilazina', dosisRef: '1500', controla: 'Gramíneas+Latifoliadas', cultivos: 'Maíz' },
  { n: 34, grupo: '3-Fotosistema II', nombre: 'Terbutrina', dosisRef: '2.000', controla: 'Gramíneas+algunas Latifoliadas', cultivos: 'Caña de azúcar, trigo' },
  { n: 35, grupo: '3-Fotosistema II', nombre: 'Hexazinona', dosisRef: '563', controla: 'Gramíneas+Latifoliadas', cultivos: 'Caña de azúcar' },
  { n: 36, grupo: '3-Fotosistema II', nombre: 'Diuron', dosisRef: '2.000', controla: 'Gramíneas+Latifoliadas', cultivos: 'Caña de azúcar, algodón, soja, maíz' },
  { n: 37, grupo: '3-Fotosistema II', nombre: 'Linuron', dosisRef: '450', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Papa, cebolla' },
  { n: 38, grupo: '3-Fotosistema II', nombre: 'Propanil', dosisRef: '2.064', controla: 'Gramíneas+algunas Latifoliadas', cultivos: 'Arroz' },
  { n: 39, grupo: '3-Fotosistema II', nombre: 'Bentazon', dosisRef: '780', controla: 'Latifoliadas+ciperáceas', cultivos: 'Soja, arroz, chía' },
  { n: 40, grupo: '3-Fotosistema II', nombre: 'Bromoxinil', dosisRef: '230', controla: 'Latifoliadas', cultivos: 'Trigo, maíz, sorgo, soja' },
  { n: 41, grupo: '3-Fotosistema II', nombre: 'Atrazina', dosisRef: '2.520', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Maíz, sorgo' },
  { n: 42, grupo: '3-Fotosistema II', nombre: 'Fluometuron', dosisRef: '1.500', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Algodón' },
  { n: 43, grupo: '4-Fotosistema I', nombre: 'Paraquat', dosisRef: '552', controla: 'Gramíneas+Latifoliadas', cultivos: 'Desecación' },
  { n: 44, grupo: '4-Fotosistema I', nombre: 'Diquat', dosisRef: '400', controla: 'Gramíneas+Latifoliadas', cultivos: 'Desecación' },
  { n: 45, grupo: '5-PPO', nombre: 'Fomesafen', dosisRef: '250', controla: 'Latifoliadas', cultivos: 'Soja' },
  { n: 46, grupo: '5-PPO', nombre: 'Lactofen', dosisRef: '180', controla: 'Latifoliadas', cultivos: 'Soja' },
  { n: 47, grupo: '5-PPO', nombre: 'Acifluorfen', dosisRef: '238', controla: 'Latifoliadas', cultivos: 'Soja, maní' },
  { n: 48, grupo: '5-PPO', nombre: 'Carfentrazone', dosisRef: '25', controla: 'Latifoliadas', cultivos: 'Soja, maíz, trigo, arroz, caña de azúcar' },
  { n: 49, grupo: '5-PPO', nombre: 'Flumiclorac', dosisRef: '20', controla: 'Latifoliadas', cultivos: 'Soja' },
  { n: 50, grupo: '5-PPO', nombre: 'Flufenoximacil', dosisRef: '25-60', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, maíz y otros según posicionamiento/registro' },
  { n: 51, grupo: '5-PPO', nombre: 'Flumioxazin', dosisRef: '58', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Soja, algodón' },
  { n: 52, grupo: '5-PPO', nombre: 'Oxyfluorfen', dosisRef: '480', controla: 'Latifoliadas', cultivos: 'Cebolla' },
  { n: 53, grupo: '5-PPO', nombre: 'Saflufenacil', dosisRef: '35', controla: 'Latifoliadas', cultivos: 'Soja, maíz' },
  { n: 54, grupo: '5-PPO', nombre: 'Piraflufen', dosisRef: '5', controla: 'Latifoliadas', cultivos: 'Algodón' },
  { n: 55, grupo: '5-PPO', nombre: 'Sulfentrazone', dosisRef: '500', controla: 'Latifoliadas+ciperáceas', cultivos: 'Soja, girasol' },
  { n: 56, grupo: '5-PPO', nombre: 'Oxadiazon', dosisRef: '760', controla: 'Gramíneas+Latifoliadas+Ciperáceas', cultivos: 'Arroz, cebolla, soja, algodón' },
  { n: 57, grupo: '5-PPO', nombre: 'Trifludimoxazin', dosisRef: '20', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Trigo, maíz, soja, maní' },
  { n: 58, grupo: '6-Biosíntesis de carotenoides', nombre: 'Isoxaflutole', dosisRef: '113', controla: 'Gramíneas+Latifoliadas', cultivos: 'Maíz, caña de azúcar' },
  { n: 59, grupo: '6-Biosíntesis de carotenoides', nombre: 'Mesotrione', dosisRef: '144', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Maíz' },
  { n: 60, grupo: '6-Biosíntesis de carotenoides', nombre: 'Flusulfinam', dosisRef: '45-135', controla: 'Gramíneas+Latifoliadas+ciperáceas', cultivos: 'Arroz' },
  { n: 61, grupo: '6-Biosíntesis de carotenoides', nombre: 'Tembotrione', dosisRef: '88', controla: 'Gramíneas+Latifoliadas', cultivos: 'Maíz' },
  { n: 62, grupo: '6-Biosíntesis de carotenoides', nombre: 'Topramezone', dosisRef: '30', controla: 'Gramíneas+Latifoliadas', cultivos: 'Maíz' },
  { n: 63, grupo: '6-Biosíntesis de carotenoides', nombre: 'Tolpyralate', dosisRef: '40', controla: 'Gramíneas+Latifoliadas', cultivos: 'Maíz, caña de azúcar' },
  { n: 64, grupo: '6-Biosíntesis de carotenoides', nombre: 'Bipirazona', dosisRef: '38', controla: 'Principalmente Latifoliadas', cultivos: 'Trigo' },
  { n: 65, grupo: '6-Biosíntesis de carotenoides', nombre: 'Flurocloridona', dosisRef: '750', controla: 'Latifoliadas', cultivos: 'Girasol, chía, trigo, maíz, papa, algodón, zanahoria' },
  { n: 66, grupo: '6-Biosíntesis de carotenoides', nombre: 'Clomazone', dosisRef: '432', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, arroz, mandioca, algodón' },
  { n: 67, grupo: '7-EPSPS', nombre: 'Glifosato', dosisRef: '1.350', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, maíz, algodón y otros cultivos tolerantes' },
  { n: 68, grupo: '8-Glutamino sintetasa', nombre: 'Glufosinato de amonio', dosisRef: '550-600', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, maíz, algodón y otros cultivos tolerantes' },
  { n: 69, grupo: '9-División celular', nombre: 'Acetochlor', dosisRef: '2.520', controla: 'Gramíneas+algunas Latifoliadas', cultivos: 'Soja, maíz' },
  { n: 70, grupo: '9-División celular', nombre: 'Alachlor', dosisRef: '2.400', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, maíz, maní' },
  { n: 71, grupo: '9-División celular', nombre: 'Pyroxasulfone', dosisRef: '153', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, maíz, trigo' },
  { n: 72, grupo: '9-División celular', nombre: 'S-metolachlor', dosisRef: '1.152', controla: 'Gramíneas+algunas Latifoliadas', cultivos: 'Soja, maíz, sorgo, maní, algodón, girasol' },
  { n: 73, grupo: '9-División celular', nombre: 'Trifluralina', dosisRef: '1.650', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, algodón, girasol' },
  { n: 74, grupo: '9-División celular', nombre: 'Pendimetalin', dosisRef: '1.400', controla: 'Gramíneas+Latifoliadas', cultivos: 'Soja, maíz, trigo, arroz, maní, algodón, cebolla' },
  { n: 75, grupo: '11-Mimetizador de auxinas', nombre: 'Quinclorac', dosisRef: '350', controla: 'Principalmente gramíneas', cultivos: 'Arroz' },
  { n: 76, grupo: '11-Mimetizador de auxinas', nombre: 'Florpyrauxifen', dosisRef: '6-7', controla: 'Latifoliadas', cultivos: 'Soja, trigo, maíz' },
  { n: 77, grupo: '11-Mimetizador de auxinas', nombre: '2,4-D', dosisRef: '72%=720 / 30%=300', controla: 'Latifoliadas', cultivos: 'Maíz, trigo, sorgo, soja' },
  { n: 78, grupo: '11-Mimetizador de auxinas', nombre: 'MCPA', dosisRef: '638', controla: 'Latifoliadas', cultivos: 'Trigo' },
  { n: 79, grupo: '11-Mimetizador de auxinas', nombre: 'Dicamba', dosisRef: '338', controla: 'Latifoliadas', cultivos: 'Maíz, trigo, soja Xtend' },
  { n: 80, grupo: '11-Mimetizador de auxinas', nombre: 'Fluroxypyr', dosisRef: '144', controla: 'Latifoliadas', cultivos: 'Trigo, maíz, soja, pastura' },
  { n: 81, grupo: '11-Mimetizador de auxinas', nombre: 'Triclopyr', dosisRef: '1.335', controla: 'Latifoliadas+arbustos/leñosas', cultivos: 'Caña de azúcar, pastura, soja (22 días de carryover)' },
  { n: 82, grupo: '11-Mimetizador de auxinas', nombre: 'Aminopyralid', dosisRef: '175', controla: 'Latifoliadas+arbustos/leñosas', cultivos: 'Trigo, Caña de Azúcar, Arroz, Pastura' },
  { n: 83, grupo: '11-Mimetizador de auxinas', nombre: 'Clopyralid', dosisRef: '43', controla: 'Latifoliadas', cultivos: 'Trigo, pastura' },
  { n: 84, grupo: '11-Mimetizador de auxinas', nombre: 'Picloram', dosisRef: '777', controla: 'Latifoliadas+arbustos/leñosas', cultivos: 'Caña de azúcar, Pastura' },
  { n: 85, grupo: '11-Mimetizador de auxinas', nombre: 'Halauxifen', dosisRef: '4-6', controla: 'Latifoliadas', cultivos: 'Trigo, girasol, soja (12 días de carryover)' },
  { n: 86, grupo: '11-Mimetizador de auxinas', nombre: 'Benazolin', dosisRef: '300', controla: 'Latifoliadas', cultivos: 'Soja' },
  { n: 87, grupo: '11-Mimetizador de auxinas', nombre: 'Flucloraminopir', dosisRef: '30-60', controla: 'Latifoliadas+ciperáceas', cultivos: 'Girasol, soja' },
  { n: 88, grupo: '12-Ácidos grasos', nombre: 'Thiobencarb', dosisRef: '2.700', controla: 'Gramíneas+algunas ciperáceas', cultivos: 'Arroz' },
  { n: 89, grupo: '32-Biosíntesis de plastoquinona', nombre: 'Aclonifen', dosisRef: '1.500', controla: 'Latifoliadas+algunas gramíneas', cultivos: 'Cebolla, ajo, zanahoria, papa, girasol' }
];

// Adyuvantes/coadyuvantes de uso frecuente (no son ingredientes activos que
// controlen malezas, así que se listan aparte para no confundirlos al
// reconocer texto — pero conviene reconocerlos igual para no marcarlos como
// "desconocidos" en el importador).
export const COADYUVANTES = [
  'Duplex', 'Agetec T.', 'Nimbus', 'Dash', 'Aureo', 'Point 4 Sixty', 'Class Act NG'
];
