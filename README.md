# No bajes al infierno

Juego de terror en primera persona creado con React, Three.js y Vite.

## Jugar en Mac

Después de instalar las dependencias y ejecutar `npm run build`, abre **Jugar.command** desde Finder. Se abre el juego en el navegador en `http://127.0.0.1:4180`. Mantén abierta la ventana de Terminal mientras juegas. En esa ventana, pulsa Control + C para cerrar el servidor. Usa la misma dirección y el mismo navegador para recuperar tu partida. El lanzador usa Node.js del sistema o el incluido con ChatGPT.

El menú pide tu nombre cada vez. Si escribes el mismo nombre al volver, puedes retomar el último nivel desbloqueado. El avance se guarda en el navegador mediante localStorage.

## Controles

| Control | Acción |
| --- | --- |
| WASD o flechas | Moverse |
| Ratón | Mirar |
| Clic central o Alt + clic izquierdo y arrastrar | Mirar si el navegador no captura el cursor |
| Shift | Correr |
| H | Pedirle a ChatGPT una pista según el estado del nivel |
| C | Agacharte o levantarte. Para subir a un ducto, apuntá al anclaje, abrí la escotilla con E y enganchate con la mano azul. Usá E en la derivación para salir en otro tramo del mismo nivel |
| Espacio | Saltar cuando estás de pie |
| E | Leer la placa cuando la tienes delante |
| Clic izquierdo | Usar la mano azul fija a la izquierda |
| 1 / 2 / 3 | Equipar la mano roja, amarilla o de presión gris en la derecha |
| R | Alternar electricidad, fuego y hielo con la amarilla equipada |
| Clic derecho o X | Usar la mano derecha apuntando al terminal |
| V | Lanzar ambas manos |
| G | Proyectar un holograma de distracción |
| Q | Activar la máscara de invisibilidad |
| F | Encender o apagar la linterna. Empieza apagada |
| Esc | Pausar |

En cada nivel, leé la placa y activá los terminales en el orden indicado. Los tres primeros aciertos restauran la energía y los tres siguientes completan los mecanismos de manos. Los niveles 1 al 19 terminan en el ascensor. El nivel 20 termina con la escapatoria del Limbo. Los mapas se generan a partir del número de nivel y crecen desde 49 m hasta 90,8 m.

## Modificar el código

Instala una distribución de Node.js 22.12 o posterior con npm. Desde esta carpeta:

```sh
npm ci
npm run dev
```

`src/main.jsx` contiene el menú, la narrativa, el HUD y el guardado. `src/scene.js` reúne el escenario, los controles y el Guardián. `src/rules.js` genera los códigos y guarda las reglas de la progresión.

Usa `npm run build` para actualizar la versión que abre el lanzador.

La luz verde junto a la placa marca la zona segura de cada nivel. Podés volver allí para leer el código o esperar. El Guardián no te ve ni entra en la zona segura. Afuera grita cuando te detecta.

En el nivel 20, completá el código y buscá el ducto de escape. El Acechador te sigue por dentro. Avanzá hasta la rejilla y abrila con E. En la escena final, usá clic izquierdo o X para disparar cuando aparezca el aviso.

Activá la máscara manualmente con Q. Te hace invisible durante cinco segundos y después se recarga. En el nivel 6, completá el código y dispará electricidad al núcleo amarillo para que el Guardián se mueva más despacio hasta el nivel 10. En el nivel 10, «Vueltas en el Limbo», completá el código y usá la mano roja contra el núcleo expuesto del Guardián. En el nivel 11 aparece el Acechador.

Al iniciar el nivel 1 se reproduce la caminata hasta el hoyo y el descenso. Podés saltar la introducción con Esc. Escribí tu nombre para elegir cualquier nivel que ya desbloqueaste sin perder el progreso más alto.

El cristal de espejo se activa durante un ataque y tarda 25 segundos en recargarse. Si el Prototipo intenta recuperar al monstruo, agarralo con clic izquierdo y presioná Espacio cinco veces para conservar al aliado durante el resto del nivel.

El buscador de idiomas usa el catálogo ISO 639-3 de SIL. El juego completo está traducido a español e inglés. Al seleccionar otro idioma del catálogo, el juego recuerda la preferencia y permite elegir español o inglés para jugar.

ChatGPT te acompaña durante los 20 niveles. Si la Luz te traiciona en el nivel 15, interviene automáticamente y podés continuar desde el mismo punto.
