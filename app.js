"use strict";

/* ==========================================================
   HotelFlow - Frontend con HTML y JavaScript puro
   Todas las peticiones pasan por el Gateway YARP.
   ========================================================== */

/* ---------- 1. Configuración ---------- */

const API_URL = "https://91b0z3wh-7039.brs.devtunnels.ms/api";
const RUTAS = {
  habitaciones: "/api/Habitacions",
  tipos: "/api/TipoHabitacions",
  huespedes: "/api/Huespeds",
  reservas: "/api/Reservas",
  limpiezas: "/api/Limpiezas"
};

const CLAVE_TENANT = "hotelflow_tenant_id";

// Estados que acepta el endpoint PATCH /api/Habitacions/{id}/estado
const ESTADOS_HABITACION = ["Disponible", "Desocupado", "Ocupado", "Reservado", "Mantenimiento"];

// Datos cargados desde la API (nunca se inventan registros)
const datos = {
  habitaciones: [],
  tipos: [],
  huespedes: [],
  reservas: [],
  limpiezas: []
};

let pantallaActual = null;

/* ---------- 2. Utilidades generales ---------- */

function $(id) {
  return document.getElementById(id);
}

function mostrarMensaje(tipo, texto) {
  const p = $("mensaje");
  p.replaceChildren();
  const etiqueta = document.createElement("strong");
  if (tipo === "ok") etiqueta.textContent = "Correcto: ";
  else if (tipo === "aviso") etiqueta.textContent = "Aviso: ";
  else etiqueta.textContent = "Error: ";
  p.append(etiqueta, texto);
}

function limpiarMensaje() {
  $("mensaje").replaceChildren();
}

function mostrar(id, visible) {
  $(id).hidden = !visible;
}

function celda(texto) {
  const td = document.createElement("td");
  td.textContent = texto === null || texto === undefined ? "" : String(texto);
  return td;
}

function crearBoton(texto, alHacerClic) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = texto;
  b.addEventListener("click", alHacerClic);
  return b;
}

function formatearBs(numero) {
  const n = Number(numero);
  if (Number.isNaN(n)) return "";
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(n);
}

function formatearFecha(valor) {
  if (!valor) return "";
  let texto = String(valor);
  // Si la fecha viene sin zona horaria, se interpreta como UTC
  if (!/[zZ]$|[+-]\d\d:\d\d$/.test(texto)) texto += "Z";
  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleString("es-BO");
}

function mismoTexto(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function textoOpcional(valor) {
  const t = valor.trim();
  return t === "" ? null : t;
}

function llenarSelect(select, opciones, textoPrimero) {
  const valorActual = select.value;
  select.replaceChildren();
  if (textoPrimero !== null) {
    const primera = document.createElement("option");
    primera.value = "";
    primera.textContent = textoPrimero;
    select.appendChild(primera);
  }
  opciones.forEach(function (op) {
    const o = document.createElement("option");
    o.value = String(op.valor);
    o.textContent = op.texto;
    select.appendChild(o);
  });
  const existe = Array.from(select.options).some(function (o) {
    return o.value === valorActual;
  });
  if (existe) select.value = valorActual;
}

// Ejecuta una acción deshabilitando el botón para no duplicar peticiones
async function conBotonBloqueado(boton, accion) {
  boton.disabled = true;
  try {
    await accion();
  } finally {
    boton.disabled = false;
  }
}

// Confirmación con ventana <dialog> (sin usar confirm() del navegador)
function confirmar(texto) {
  return new Promise(function (resolver) {
    const dlg = $("dlg-confirmar");
    const si = $("confirmar-si");
    const no = $("confirmar-no");
    $("confirmar-texto").textContent = texto;

    function cerrar(respuesta) {
      si.onclick = null;
      no.onclick = null;
      dlg.oncancel = null;
      dlg.close();
      resolver(respuesta);
    }

    si.onclick = function () { cerrar(true); };
    no.onclick = function () { cerrar(false); };
    dlg.oncancel = function (evento) {
      evento.preventDefault();
      cerrar(false);
    };
    dlg.showModal();
  });
}

/* ---------- 3. Tenant e ingreso ----------
   El usuario escribe en la pantalla de inicio el tenant que se le entregó.
   Se recuerda solo mientras la pestaña esté abierta (sessionStorage).
   Nota: esto no es autenticación; solo indica al backend con qué hotel trabajar. */

let tenantActual = leerTenantGuardado();

function leerTenantGuardado() {
  try {
    return (sessionStorage.getItem(CLAVE_TENANT) || "").trim();
  } catch (e) {
    return "";
  }
}

function obtenerTenant() {
  return tenantActual;
}

function fijarTenant(valor) {
  tenantActual = valor;
  try {
    if (valor) sessionStorage.setItem(CLAVE_TENANT, valor);
    else sessionStorage.removeItem(CLAVE_TENANT);
  } catch (e) {
    // Si el navegador no permite guardarlo, se mantiene solo en memoria
  }
}

function mostrarAplicacion() {
  mostrar("pantalla-inicio", false);
  mostrar("aplicacion", true);
  $("tenant-actual").textContent = obtenerTenant();
  mostrarPantalla("habitaciones");
}

async function ingresar(evento) {
  evento.preventDefault();
  const valor = $("inicio-tenant").value.trim();
  const error = $("inicio-error");
  error.textContent = "";

  if (valor === "") {
    error.textContent = "Escribe el tenant para poder ingresar.";
    return;
  }

  await conBotonBloqueado($("inicio-entrar"), async function () {
    mostrar("inicio-cargando", true);
    fijarTenant(valor);
    try {
      // Se comprueba con un GET existente (tipos de habitación) que el backend acepta el tenant
      await api(RUTAS.tipos);
      mostrarAplicacion();
    } catch (e) {
      fijarTenant("");
      error.textContent = "No se pudo ingresar con ese tenant. " + e.message;
    } finally {
      mostrar("inicio-cargando", false);
    }
  });
}

function salir() {
  fijarTenant("");
  // Se descartan los datos para no mezclar información de distintos hoteles
  datos.habitaciones = [];
  datos.tipos = [];
  datos.huespedes = [];
  datos.reservas = [];
  datos.limpiezas = [];
  pantallaActual = null;

  limpiarMensaje();
  $("inicio-tenant").value = "";
  $("inicio-error").textContent = "";
  mostrar("aplicacion", false);
  mostrar("pantalla-inicio", true);
}

/* ---------- 4. Comunicación con la API ---------- */

function extraerMensaje(cuerpo, estado) {
  if (typeof cuerpo === "string" && cuerpo.trim() !== "") return cuerpo;
  if (cuerpo && typeof cuerpo === "object") {
    if (cuerpo.mensaje) return cuerpo.mensaje;
    if (cuerpo.errors) {
      const lista = Object.values(cuerpo.errors).flat();
      if (lista.length > 0) return lista.join(" ");
    }
    if (cuerpo.title) return cuerpo.title;
  }
  return "El servidor respondió con el código " + estado + ".";
}

async function api(ruta, metodo, cuerpo) {
  const tenant = obtenerTenant();
  if (!tenant) {
    throw new Error("No hay un tenant activo. Vuelve a la pantalla de ingreso.");
  }

  const opciones = {
    method: metodo || "GET",
    headers: { "X-Tenant-Id": tenant }
  };
  if (cuerpo !== undefined) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(GATEWAY + ruta, opciones);
  } catch (e) {
    const origen = location.protocol === "file:" ? "un archivo local (file://)" : location.origin;
    throw new Error(
      "No se pudo conectar con el Gateway (" + GATEWAY + "). Esta página está abierta desde " + origen +
      ". Revisa que el Gateway esté iniciado, que hayas aceptado su certificado HTTPS y que la " +
      "página se abra desde http://localhost:5500 o http://127.0.0.1:5500 (los orígenes que permite el CORS del Gateway). " +
      "Abre F12 > Consola para ver la causa exacta."
    );
  }

  const texto = await respuesta.text();
  let contenido = null;
  if (texto) {
    try {
      contenido = JSON.parse(texto);
    } catch (e) {
      contenido = texto;
    }
  }

  if (!respuesta.ok) {
    let mensaje = extraerMensaje(contenido, respuesta.status);
    // Ayuda si el backend marca como obligatoria una propiedad de navegación (Nullable habilitado)
    if (respuesta.status === 400 && /(TipoHabitacion|Huesped) field is required/i.test(mensaje)) {
      mensaje += " (Tu backend exige esa propiedad de navegación en el cuerpo de la petición; " +
        "revisa la nota sobre el modelo C# en la guía.)";
    }
    throw new Error(mensaje);
  }
  return contenido;
}

/* ---------- 5. Navegación ---------- */

const CARGADORES = {
  tipos: cargarTipos,
  habitaciones: cargarHabitaciones,
  huespedes: cargarHuespedes,
  reservas: cargarReservas,
  limpieza: cargarLimpieza
};

function cargarPantalla(nombre) {
  return CARGADORES[nombre]();
}

// Devuelve la promesa de carga para poder esperar los datos antes de abrir un formulario
function mostrarPantalla(nombre) {
  pantallaActual = nombre;
  ["tipos", "habitaciones", "huespedes", "reservas", "limpieza"].forEach(function (n) {
    mostrar("pantalla-" + n, n === nombre);
  });
  limpiarMensaje();
  return cargarPantalla(nombre);
}

/* ==========================================================
   6. HABITACIONES
   Campos reales: habitacionId, numero, piso, tipoHabitacionId,
   estado, tipoHabitacion { nombre, capacidad, descripcion, precioBase }
   ========================================================== */

function buscarTipo(habitacion) {
  const deLista = datos.tipos.find(function (t) {
    return t.tipoHabitacionId === habitacion.tipoHabitacionId;
  });
  return deLista || habitacion.tipoHabitacion || null;
}

async function cargarHabitaciones() {
  mostrar("hab-cargando", true);
  mostrar("hab-vacio", false);
  mostrar("hab-tabla", false);
  try {
    const resultados = await Promise.all([api(RUTAS.tipos), api(RUTAS.habitaciones)]);
    datos.tipos = resultados[0] || [];
    datos.habitaciones = resultados[1] || [];
    llenarFiltrosHabitaciones();
    dibujarHabitaciones();
  } catch (e) {
    datos.habitaciones = [];
    $("hab-cuerpo").replaceChildren();
    $("hab-vacio").textContent = "No se pudieron cargar las habitaciones.";
    mostrar("hab-vacio", true);
    mostrarMensaje("error", e.message);
  } finally {
    mostrar("hab-cargando", false);
  }
}

function llenarFiltrosHabitaciones() {
  llenarSelect(
    $("hab-filtro-tipo"),
    datos.tipos.map(function (t) { return { valor: t.tipoHabitacionId, texto: t.nombre }; }),
    "Todos"
  );
  llenarSelect(
    $("hab-filtro-estado"),
    ESTADOS_HABITACION.map(function (e) { return { valor: e, texto: e }; }),
    "Todos"
  );
  const pisos = Array.from(new Set(datos.habitaciones.map(function (h) { return h.piso; })))
    .sort(function (a, b) { return a - b; });
  llenarSelect(
    $("hab-filtro-piso"),
    pisos.map(function (p) { return { valor: p, texto: "Piso " + p }; }),
    "Todos"
  );
}

function dibujarHabitaciones() {
  const cuerpo = $("hab-cuerpo");
  cuerpo.replaceChildren();

  const texto = $("hab-buscar").value.trim().toLowerCase();
  const fTipo = $("hab-filtro-tipo").value;
  const fEstado = $("hab-filtro-estado").value;
  const fPiso = $("hab-filtro-piso").value;

  const lista = datos.habitaciones
    .filter(function (h) {
      if (texto && !String(h.numero).toLowerCase().includes(texto)) return false;
      if (fTipo && String(h.tipoHabitacionId) !== fTipo) return false;
      if (fEstado && h.estado !== fEstado) return false;
      if (fPiso !== "" && String(h.piso) !== fPiso) return false;
      return true;
    })
    .sort(function (a, b) {
      return String(a.numero).localeCompare(String(b.numero), "es", { numeric: true });
    });

  if (lista.length === 0) {
    $("hab-vacio").textContent = datos.habitaciones.length === 0
      ? "No hay habitaciones registradas."
      : "Ninguna habitación coincide con la búsqueda o los filtros.";
    mostrar("hab-vacio", true);
    mostrar("hab-tabla", false);
    return;
  }

  mostrar("hab-vacio", false);
  mostrar("hab-tabla", true);

  lista.forEach(function (h) {
    const tipo = buscarTipo(h);
    const fila = document.createElement("tr");
    fila.appendChild(celda(h.numero));
    fila.appendChild(celda(tipo ? tipo.nombre : "Tipo no encontrado"));
    fila.appendChild(celda(h.piso));
    fila.appendChild(celda(tipo ? formatearBs(tipo.precioBase) : ""));
    fila.appendChild(celda(h.estado));

    const acciones = document.createElement("td");
    acciones.appendChild(crearBoton("Editar", function () { abrirFormHabitacion(h); }));
    acciones.append(" ");
    acciones.appendChild(crearBoton("Cambiar estado", function () { abrirFormEstado(h); }));
    fila.appendChild(acciones);

    cuerpo.appendChild(fila);
  });
}

function actualizarPrecioFormulario() {
  const id = Number($("hab-tipo").value);
  const tipo = datos.tipos.find(function (t) { return t.tipoHabitacionId === id; });
  $("hab-precio-info").textContent = tipo
    ? "Precio por noche: " + formatearBs(tipo.precioBase) + " (precio base del tipo seleccionado, capacidad: " + tipo.capacidad + ")"
    : "";
}

function abrirFormHabitacion(habitacion) {
  if (datos.tipos.length === 0) {
    // Sin tipos no se puede registrar una habitación: se lleva al usuario a registrar uno
    mostrarPantalla("tipos");
    mostrarMensaje("aviso", "Primero registra un tipo de habitación; después podrás registrar habitaciones.");
    return;
  }

  const editando = Boolean(habitacion);
  $("hab-error").textContent = "";
  $("hab-titulo").textContent = editando ? "Editar habitación" : "Registrar habitación";
  $("hab-id").value = editando ? habitacion.habitacionId : "";
  $("hab-numero").value = editando ? habitacion.numero : "";
  $("hab-piso").value = editando ? habitacion.piso : "";

  llenarSelect(
    $("hab-tipo"),
    datos.tipos.map(function (t) { return { valor: t.tipoHabitacionId, texto: t.nombre }; }),
    "Seleccione un tipo"
  );
  $("hab-tipo").value = editando ? String(habitacion.tipoHabitacionId) : "";

  llenarSelect(
    $("hab-estado"),
    ESTADOS_HABITACION.map(function (e) { return { valor: e, texto: e }; }),
    null
  );
  $("hab-estado").value = editando ? habitacion.estado : "Disponible";
  $("hab-estado").disabled = editando;
  $("hab-estado-nota").textContent = editando
    ? "Para cambiar el estado usa el botón \"Cambiar estado\" de la tabla."
    : "";

  actualizarPrecioFormulario();
  $("dlg-habitacion").showModal();
}

async function guardarHabitacion(evento) {
  evento.preventDefault();
  const error = $("hab-error");
  error.textContent = "";

  const id = $("hab-id").value;
  const numero = $("hab-numero").value.trim();
  const pisoTexto = $("hab-piso").value.trim();
  const tipoId = Number($("hab-tipo").value);

  if (numero === "") {
    error.textContent = "El número de habitación es obligatorio.";
    return;
  }
  if (!/^-?\d+$/.test(pisoTexto)) {
    error.textContent = "El piso es obligatorio y debe ser un número entero.";
    return;
  }
  if (!tipoId) {
    error.textContent = "Selecciona un tipo de habitación.";
    return;
  }
  const duplicada = datos.habitaciones.some(function (h) {
    return mismoTexto(h.numero, numero) && String(h.habitacionId) !== id;
  });
  if (duplicada) {
    error.textContent = "Ya existe una habitación con el número " + numero + ".";
    return;
  }

  await conBotonBloqueado($("hab-guardar"), async function () {
    try {
      if (id === "") {
        await api(RUTAS.habitaciones, "POST", {
          numero: numero,
          piso: Number(pisoTexto),
          tipoHabitacionId: tipoId,
          estado: $("hab-estado").value
        });
        mostrarMensaje("ok", "Habitación " + numero + " registrada.");
      } else {
        const original = datos.habitaciones.find(function (h) {
          return String(h.habitacionId) === id;
        });
        await api(RUTAS.habitaciones + "/" + id, "PUT", {
          habitacionId: Number(id),
          numero: numero,
          piso: Number(pisoTexto),
          tipoHabitacionId: tipoId,
          estado: original.estado
        });
        mostrarMensaje("ok", "Habitación " + numero + " actualizada.");
      }
      $("dlg-habitacion").close();
      await cargarHabitaciones();
    } catch (e) {
      error.textContent = e.message;
    }
  });
}

/* ---- Cambiar estado de una habitación (PATCH existente) ---- */

let habitacionEnCambioDeEstado = null;

function abrirFormEstado(habitacion) {
  habitacionEnCambioDeEstado = habitacion;
  $("est-error").textContent = "";
  $("est-descripcion").textContent =
    "Habitación " + habitacion.numero + " (estado actual: " + habitacion.estado + ")";
  llenarSelect(
    $("est-select"),
    ESTADOS_HABITACION.map(function (e) { return { valor: e, texto: e }; }),
    null
  );
  $("est-select").value = habitacion.estado;
  $("dlg-estado").showModal();
}

async function guardarEstadoHabitacion(evento) {
  evento.preventDefault();
  const habitacion = habitacionEnCambioDeEstado;
  const nuevo = $("est-select").value;
  const error = $("est-error");
  error.textContent = "";

  if (nuevo === habitacion.estado) {
    error.textContent = "Selecciona un estado distinto al actual.";
    return;
  }

  const acepta = await confirmar(
    "¿Cambiar la habitación " + habitacion.numero + " de \"" + habitacion.estado + "\" a \"" + nuevo + "\"?"
  );
  if (!acepta) return;

  await conBotonBloqueado($("est-guardar"), async function () {
    try {
      await api(RUTAS.habitaciones + "/" + habitacion.habitacionId + "/estado", "PATCH", { estado: nuevo });
      $("dlg-estado").close();
      mostrarMensaje("ok", "Estado de la habitación " + habitacion.numero + " cambiado a " + nuevo + ".");
      await cargarHabitaciones();
    } catch (e) {
      error.textContent = e.message;
    }
  });
}

/* ==========================================================
   7. HUÉSPEDES
   Campos reales: huespedId, nombre, apellido, documentoIdentidad,
   telefono, correoElectronico
   ========================================================== */

async function cargarHuespedes() {
  mostrar("hue-cargando", true);
  mostrar("hue-vacio", false);
  mostrar("hue-tabla", false);
  try {
    datos.huespedes = (await api(RUTAS.huespedes)) || [];
    dibujarHuespedes();
  } catch (e) {
    datos.huespedes = [];
    $("hue-cuerpo").replaceChildren();
    $("hue-vacio").textContent = "No se pudieron cargar los huéspedes.";
    mostrar("hue-vacio", true);
    mostrarMensaje("error", e.message);
  } finally {
    mostrar("hue-cargando", false);
  }
}

function dibujarHuespedes() {
  const cuerpo = $("hue-cuerpo");
  cuerpo.replaceChildren();

  const texto = $("hue-buscar").value.trim().toLowerCase();

  const lista = datos.huespedes
    .filter(function (h) {
      if (!texto) return true;
      const campos = [h.nombre, h.apellido, h.nombre + " " + h.apellido, h.documentoIdentidad];
      return campos.some(function (c) {
        return String(c || "").toLowerCase().includes(texto);
      });
    })
    .sort(function (a, b) {
      return (a.apellido + " " + a.nombre).localeCompare(b.apellido + " " + b.nombre, "es");
    });

  if (lista.length === 0) {
    $("hue-vacio").textContent = datos.huespedes.length === 0
      ? "No hay huéspedes registrados."
      : "Ningún huésped coincide con la búsqueda.";
    mostrar("hue-vacio", true);
    mostrar("hue-tabla", false);
    return;
  }

  mostrar("hue-vacio", false);
  mostrar("hue-tabla", true);

  lista.forEach(function (h) {
    const fila = document.createElement("tr");
    fila.appendChild(celda(h.nombre));
    fila.appendChild(celda(h.apellido));
    fila.appendChild(celda(h.documentoIdentidad));
    fila.appendChild(celda(h.telefono));
    fila.appendChild(celda(h.correoElectronico));

    const acciones = document.createElement("td");
    acciones.appendChild(crearBoton("Editar", function () { abrirFormHuesped(h); }));
    fila.appendChild(acciones);

    cuerpo.appendChild(fila);
  });
}

function abrirFormHuesped(huesped) {
  const editando = Boolean(huesped);
  $("hue-error").textContent = "";
  $("hue-titulo").textContent = editando ? "Editar huésped" : "Registrar huésped";
  $("hue-id").value = editando ? huesped.huespedId : "";
  $("hue-nombre").value = editando ? huesped.nombre : "";
  $("hue-apellido").value = editando ? huesped.apellido : "";
  $("hue-documento").value = editando && huesped.documentoIdentidad ? huesped.documentoIdentidad : "";
  $("hue-telefono").value = editando && huesped.telefono ? huesped.telefono : "";
  $("hue-correo").value = editando && huesped.correoElectronico ? huesped.correoElectronico : "";
  $("dlg-huesped").showModal();
}

async function guardarHuesped(evento) {
  evento.preventDefault();
  const error = $("hue-error");
  error.textContent = "";

  const id = $("hue-id").value;
  const nombre = $("hue-nombre").value.trim();
  const apellido = $("hue-apellido").value.trim();
  const documento = textoOpcional($("hue-documento").value);
  const telefono = textoOpcional($("hue-telefono").value);
  const correo = textoOpcional($("hue-correo").value);

  if (nombre === "") {
    error.textContent = "El nombre es obligatorio.";
    return;
  }
  if (apellido === "") {
    error.textContent = "El apellido es obligatorio.";
    return;
  }
  if (correo !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    error.textContent = "El correo electrónico no tiene un formato válido.";
    return;
  }

  const cuerpo = {
    nombre: nombre,
    apellido: apellido,
    documentoIdentidad: documento,
    telefono: telefono,
    correoElectronico: correo
  };

  await conBotonBloqueado($("hue-guardar"), async function () {
    try {
      let creado = null;
      if (id === "") {
        creado = await api(RUTAS.huespedes, "POST", cuerpo);
        mostrarMensaje("ok", "Huésped " + nombre + " " + apellido + " registrado.");
      } else {
        cuerpo.huespedId = Number(id);
        await api(RUTAS.huespedes + "/" + id, "PUT", cuerpo);
        mostrarMensaje("ok", "Huésped " + nombre + " " + apellido + " actualizado.");
      }
      $("dlg-huesped").close();
      await cargarHuespedes();
      // Solo al registrar un huésped nuevo se ofrece continuar con la reserva
      if (creado) abrirHuespedCreado(creado, nombre, apellido);
    } catch (e) {
      error.textContent = e.message;
    }
  });
}

/* ==========================================================
   8. LIMPIEZA
   Campos reales: limpiezaId, habitacionId, estado ("Pendiente" o
   "Completada"), observacion, fechaRegistro.
   El número de habitación se obtiene consultando la API de Habitaciones.
   ========================================================== */

function buscarHabitacionPorId(id) {
  return datos.habitaciones.find(function (h) { return h.habitacionId === id; }) || null;
}

async function cargarLimpieza() {
  mostrar("lim-cargando", true);
  mostrar("lim-vacio", false);
  mostrar("lim-tabla", false);
  mostrar("lim-por-limpiar-vacio", false);
  mostrar("lim-por-limpiar-tabla", false);
  try {
    const resultados = await Promise.allSettled([api(RUTAS.limpiezas), api(RUTAS.habitaciones)]);

    if (resultados[0].status === "rejected") throw resultados[0].reason;
    datos.limpiezas = resultados[0].value || [];

    if (resultados[1].status === "fulfilled") {
      datos.habitaciones = resultados[1].value || [];
    } else {
      datos.habitaciones = [];
      mostrarMensaje(
        "aviso",
        "No se pudo consultar Habitaciones, por eso no se muestran los números de habitación. " + resultados[1].reason.message
      );
    }

    dibujarPorLimpiar();
    dibujarLimpiezas();
  } catch (e) {
    datos.limpiezas = [];
    $("lim-cuerpo").replaceChildren();
    $("lim-por-limpiar-cuerpo").replaceChildren();
    $("lim-vacio").textContent = "No se pudieron cargar las tareas de limpieza.";
    mostrar("lim-vacio", true);
    mostrarMensaje("error", e.message);
  } finally {
    mostrar("lim-cargando", false);
  }
}

function dibujarPorLimpiar() {
  const cuerpo = $("lim-por-limpiar-cuerpo");
  cuerpo.replaceChildren();

  const lista = datos.habitaciones
    .filter(function (h) {
      if (!mismoTexto(h.estado, "Desocupado")) return false;
      const tienePendiente = datos.limpiezas.some(function (l) {
        return l.habitacionId === h.habitacionId && l.estado === "Pendiente";
      });
      return !tienePendiente;
    })
    .sort(function (a, b) {
      return String(a.numero).localeCompare(String(b.numero), "es", { numeric: true });
    });

  if (lista.length === 0) {
    $("lim-por-limpiar-vacio").textContent = datos.habitaciones.length === 0
      ? "No se pudo determinar qué habitaciones están desocupadas."
      : "No hay habitaciones desocupadas pendientes de registrar limpieza.";
    mostrar("lim-por-limpiar-vacio", true);
    mostrar("lim-por-limpiar-tabla", false);
    return;
  }

  mostrar("lim-por-limpiar-vacio", false);
  mostrar("lim-por-limpiar-tabla", true);

  lista.forEach(function (h) {
    const fila = document.createElement("tr");
    fila.appendChild(celda(h.numero));
    fila.appendChild(celda(h.estado));
    const acciones = document.createElement("td");
    acciones.appendChild(crearBoton("Registrar limpieza", function () { abrirFormLimpieza(h); }));
    fila.appendChild(acciones);
    cuerpo.appendChild(fila);
  });
}

function dibujarLimpiezas() {
  const cuerpo = $("lim-cuerpo");
  cuerpo.replaceChildren();

  const filtro = $("lim-filtro-estado").value;

  const lista = datos.limpiezas
    .filter(function (l) { return !filtro || l.estado === filtro; })
    .sort(function (a, b) {
      // Primero las pendientes, luego las más recientes
      if (a.estado !== b.estado) return a.estado === "Pendiente" ? -1 : 1;
      return String(b.fechaRegistro).localeCompare(String(a.fechaRegistro));
    });

  if (lista.length === 0) {
    $("lim-vacio").textContent = datos.limpiezas.length === 0
      ? "No hay tareas de limpieza registradas."
      : "No hay tareas con el estado seleccionado.";
    mostrar("lim-vacio", true);
    mostrar("lim-tabla", false);
    return;
  }

  mostrar("lim-vacio", false);
  mostrar("lim-tabla", true);

  lista.forEach(function (l) {
    const hab = buscarHabitacionPorId(l.habitacionId);
    const fila = document.createElement("tr");
    fila.appendChild(celda(hab ? hab.numero : "No disponible"));
    fila.appendChild(celda(l.estado));
    fila.appendChild(celda(l.observacion));
    fila.appendChild(celda(formatearFecha(l.fechaRegistro)));

    const acciones = document.createElement("td");
    if (l.estado === "Pendiente") {
      acciones.appendChild(crearBoton("Marcar como completada", function () { completarLimpieza(l); }));
    } else {
      acciones.textContent = "Sin acciones";
    }
    fila.appendChild(acciones);

    cuerpo.appendChild(fila);
  });
}

/* ---- Registrar una tarea de limpieza (POST) ---- */

let habitacionParaLimpieza = null;

function abrirFormLimpieza(habitacion) {
  habitacionParaLimpieza = habitacion;
  $("limp-error").textContent = "";
  $("limp-observacion").value = "";
  $("limp-descripcion").textContent = "Habitación " + habitacion.numero;
  $("dlg-limpieza").showModal();
}

async function guardarLimpieza(evento) {
  evento.preventDefault();
  const habitacion = habitacionParaLimpieza;
  const error = $("limp-error");
  error.textContent = "";

  await conBotonBloqueado($("limp-guardar"), async function () {
    try {
      await api(RUTAS.limpiezas, "POST", {
        habitacionId: habitacion.habitacionId,
        observacion: textoOpcional($("limp-observacion").value)
      });
      $("dlg-limpieza").close();
      mostrarMensaje("ok", "Limpieza registrada para la habitación " + habitacion.numero + ".");
      await cargarLimpieza();
    } catch (e) {
      error.textContent = e.message;
    }
  });
}

/* ---- Completar una tarea (PUT existente) ---- */

async function completarLimpieza(limpieza) {
  const hab = buscarHabitacionPorId(limpieza.habitacionId);
  const nombre = hab ? "la habitación " + hab.numero : "esta habitación";

  const acepta = await confirmar(
    "¿Marcar como completada la limpieza de " + nombre + "? El sistema verificará la habitación y la dejará disponible."
  );
  if (!acepta) return;

  try {
    await api(RUTAS.limpiezas + "/" + limpieza.limpiezaId, "PUT", {
      limpiezaId: limpieza.limpiezaId,
      habitacionId: limpieza.habitacionId,
      estado: "Completada",
      observacion: limpieza.observacion,
      fechaRegistro: limpieza.fechaRegistro
    });
    mostrarMensaje("ok", "Limpieza completada. El sistema dejó " + nombre + " como disponible.");
  } catch (e) {
    mostrarMensaje("error", e.message);
  }
  await cargarLimpieza();
}

/* ==========================================================
   9. TIPOS DE HABITACIÓN
   Campos reales: tipoHabitacionId, nombre, descripcion, capacidad, precioBase
   (precioBase es el precio por noche)
   ========================================================== */

async function cargarTipos() {
  mostrar("tip-cargando", true);
  mostrar("tip-vacio", false);
  mostrar("tip-tabla", false);
  try {
    datos.tipos = (await api(RUTAS.tipos)) || [];
    dibujarTipos();
  } catch (e) {
    datos.tipos = [];
    $("tip-cuerpo").replaceChildren();
    $("tip-vacio").textContent = "No se pudieron cargar los tipos de habitación.";
    mostrar("tip-vacio", true);
    mostrarMensaje("error", e.message);
  } finally {
    mostrar("tip-cargando", false);
  }
}

function dibujarTipos() {
  const cuerpo = $("tip-cuerpo");
  cuerpo.replaceChildren();

  const lista = datos.tipos.slice().sort(function (a, b) {
    return String(a.nombre).localeCompare(String(b.nombre), "es");
  });

  if (lista.length === 0) {
    $("tip-vacio").textContent = "No hay tipos de habitación registrados. Registra el primero con el botón de arriba.";
    mostrar("tip-vacio", true);
    mostrar("tip-tabla", false);
    return;
  }

  mostrar("tip-vacio", false);
  mostrar("tip-tabla", true);

  lista.forEach(function (t) {
    const fila = document.createElement("tr");
    fila.appendChild(celda(t.nombre));
    fila.appendChild(celda(t.descripcion));
    fila.appendChild(celda(t.capacidad));
    fila.appendChild(celda(formatearBs(t.precioBase)));

    const acciones = document.createElement("td");
    acciones.appendChild(crearBoton("Editar", function () { abrirFormTipo(t); }));
    fila.appendChild(acciones);

    cuerpo.appendChild(fila);
  });
}

function abrirFormTipo(tipo) {
  const editando = Boolean(tipo);
  $("tip-error").textContent = "";
  $("tip-titulo").textContent = editando ? "Editar tipo de habitación" : "Registrar tipo de habitación";
  $("tip-id").value = editando ? tipo.tipoHabitacionId : "";
  $("tip-nombre").value = editando ? tipo.nombre : "";
  $("tip-descripcion").value = editando && tipo.descripcion ? tipo.descripcion : "";
  $("tip-capacidad").value = editando ? tipo.capacidad : "";
  $("tip-precio").value = editando ? tipo.precioBase : "";
  $("dlg-tipo").showModal();
}

async function guardarTipo(evento) {
  evento.preventDefault();
  const error = $("tip-error");
  error.textContent = "";

  const id = $("tip-id").value;
  const nombre = $("tip-nombre").value.trim();
  const descripcion = $("tip-descripcion").value.trim();
  const capacidadTexto = $("tip-capacidad").value.trim();
  const precioTexto = $("tip-precio").value.trim();

  if (nombre === "") {
    error.textContent = "El nombre del tipo es obligatorio.";
    return;
  }
  if (!/^\d+$/.test(capacidadTexto) || Number(capacidadTexto) < 1) {
    error.textContent = "La capacidad debe ser un número entero mayor a 0.";
    return;
  }
  const precio = Number(precioTexto);
  if (precioTexto === "" || !Number.isFinite(precio) || precio <= 0) {
    error.textContent = "El precio por noche debe ser un número mayor a 0.";
    return;
  }
  const duplicado = datos.tipos.some(function (t) {
    return mismoTexto(t.nombre, nombre) && String(t.tipoHabitacionId) !== id;
  });
  if (duplicado) {
    error.textContent = "Ya existe un tipo de habitación llamado \"" + nombre + "\".";
    return;
  }

  const cuerpo = {
    nombre: nombre,
    descripcion: descripcion,
    capacidad: Number(capacidadTexto),
    precioBase: Math.round(precio * 100) / 100
  };

  await conBotonBloqueado($("tip-guardar"), async function () {
    try {
      if (id === "") {
        await api(RUTAS.tipos, "POST", cuerpo);
        mostrarMensaje("ok", "Tipo de habitación \"" + nombre + "\" registrado. Ya puedes usarlo al registrar habitaciones.");
      } else {
        cuerpo.tipoHabitacionId = Number(id);
        await api(RUTAS.tipos + "/" + id, "PUT", cuerpo);
        mostrarMensaje("ok", "Tipo de habitación \"" + nombre + "\" actualizado.");
      }
      $("dlg-tipo").close();
      await cargarTipos();
    } catch (e) {
      error.textContent = e.message;
    }
  });
}

/* ==========================================================
   10. HUÉSPED REGISTRADO: botón "Continuar con la reserva"
   ========================================================== */

let huespedRecienCreado = null;

function abrirHuespedCreado(huesped, nombre, apellido) {
  huespedRecienCreado = huesped;
  $("hc-texto").textContent = "El huésped " + nombre + " " + apellido + " se registró correctamente.";
  $("dlg-huesped-creado").showModal();
}

async function continuarConReserva() {
  const huesped = huespedRecienCreado;
  $("dlg-huesped-creado").close();
  // Se esperan los datos de la pantalla de reservas antes de abrir el formulario
  await mostrarPantalla("reservas");
  abrirFormReserva(huesped && huesped.huespedId ? huesped.huespedId : null);
}

/* ==========================================================
   11. RESERVAS
   Campos reales: reservaId, huespedId, habitacionId, fechaEntrada,
   fechaSalida, cantidadPersonas, montoTotal, estado ("Pendiente" al crear).
   El monto total se calcula: noches x precio por noche del tipo de la habitación.
   ========================================================== */

let montoReserva = null;

function buscarHuespedPorId(id) {
  return datos.huespedes.find(function (h) { return h.huespedId === id; }) || null;
}

function nombreCompleto(huesped) {
  return huesped ? huesped.nombre + " " + huesped.apellido : "No disponible";
}

// "2026-10-27" -> "27/10/2026" (sin pasar por Date para evitar desfases de zona horaria)
function formatearFechaSolo(texto) {
  const partes = String(texto || "").slice(0, 10).split("-");
  return partes.length === 3 ? partes[2] + "/" + partes[1] + "/" + partes[0] : String(texto || "");
}

function hoyTexto() {
  const f = new Date();
  return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0");
}

function calcularNoches(entrada, salida) {
  const a = entrada.split("-").map(Number);
  const b = salida.split("-").map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

async function cargarReservas() {
  mostrar("res-cargando", true);
  mostrar("res-vacio", false);
  mostrar("res-tabla", false);
  try {
    const r = await Promise.allSettled([
      api(RUTAS.reservas),
      api(RUTAS.habitaciones),
      api(RUTAS.huespedes)
    ]);

    if (r[0].status === "rejected") throw r[0].reason;
    datos.reservas = r[0].value || [];
    datos.habitaciones = r[1].status === "fulfilled" ? (r[1].value || []) : [];
    datos.huespedes = r[2].status === "fulfilled" ? (r[2].value || []) : [];

    const fallos = [];
    if (r[1].status === "rejected") fallos.push("Habitaciones: " + r[1].reason.message);
    if (r[2].status === "rejected") fallos.push("Huéspedes: " + r[2].reason.message);
    if (fallos.length > 0) {
      mostrarMensaje("aviso", "No se pudo consultar todo lo necesario para las reservas. " + fallos.join(" "));
    }

    dibujarReservas();
  } catch (e) {
    datos.reservas = [];
    $("res-cuerpo").replaceChildren();
    $("res-vacio").textContent = "No se pudieron cargar las reservas.";
    mostrar("res-vacio", true);
    mostrarMensaje("error", e.message);
  } finally {
    mostrar("res-cargando", false);
  }
}

function dibujarReservas() {
  const cuerpo = $("res-cuerpo");
  cuerpo.replaceChildren();

  const lista = datos.reservas.slice().sort(function (a, b) {
    return String(b.fechaEntrada).localeCompare(String(a.fechaEntrada));
  });

  if (lista.length === 0) {
    $("res-vacio").textContent = "No hay reservas registradas.";
    mostrar("res-vacio", true);
    mostrar("res-tabla", false);
    return;
  }

  mostrar("res-vacio", false);
  mostrar("res-tabla", true);

  lista.forEach(function (r) {
    const huesped = r.huesped || buscarHuespedPorId(r.huespedId);
    const hab = buscarHabitacionPorId(r.habitacionId);
    const fila = document.createElement("tr");
    fila.appendChild(celda(nombreCompleto(huesped)));
    fila.appendChild(celda(hab ? hab.numero : "No disponible"));
    fila.appendChild(celda(formatearFechaSolo(r.fechaEntrada)));
    fila.appendChild(celda(formatearFechaSolo(r.fechaSalida)));
    fila.appendChild(celda(r.cantidadPersonas));
    fila.appendChild(celda(formatearBs(r.montoTotal)));
    fila.appendChild(celda(r.estado));
    cuerpo.appendChild(fila);
  });
}

function habitacionesReservables() {
  // Solo se ofrecen habitaciones disponibles: una que necesita limpieza o mantenimiento no se muestra
  return datos.habitaciones
    .filter(function (h) { return mismoTexto(h.estado, "Disponible"); })
    .sort(function (a, b) {
      return String(a.numero).localeCompare(String(b.numero), "es", { numeric: true });
    });
}

function habitacionSeleccionadaEnReserva() {
  return buscarHabitacionPorId(Number($("res-habitacion").value));
}

function actualizarMontoReserva() {
  const hab = habitacionSeleccionadaEnReserva();
  const tipo = hab ? buscarTipo(hab) : null;

  $("res-hab-info").textContent = tipo
    ? "Tipo: " + tipo.nombre + " | Capacidad: " + tipo.capacidad + " personas | Precio por noche: " + formatearBs(tipo.precioBase)
    : "";

  montoReserva = null;
  $("res-monto").value = "";
  $("res-monto-detalle").textContent = "";

  const entrada = $("res-entrada").value;
  const salida = $("res-salida").value;
  if (!tipo || !entrada || !salida) return;

  const noches = calcularNoches(entrada, salida);
  if (noches < 1) {
    $("res-monto-detalle").textContent = "La fecha de salida debe ser posterior a la de entrada.";
    return;
  }

  montoReserva = Math.round(noches * Number(tipo.precioBase) * 100) / 100;
  $("res-monto").value = formatearBs(montoReserva);
  $("res-monto-detalle").textContent = noches + " noche(s) x " + formatearBs(tipo.precioBase);
}

function abrirFormReserva(huespedId) {
  if (datos.huespedes.length === 0) {
    mostrarMensaje("error", "No hay huéspedes registrados. Registra primero un huésped para crear una reserva.");
    return;
  }
  const habitaciones = habitacionesReservables();
  if (habitaciones.length === 0) {
    mostrarMensaje("error", "No hay habitaciones disponibles para reservar.");
    return;
  }

  $("res-error").textContent = "";

  llenarSelect(
    $("res-huesped"),
    datos.huespedes
      .slice()
      .sort(function (a, b) { return nombreCompleto(a).localeCompare(nombreCompleto(b), "es"); })
      .map(function (h) {
        const documento = h.documentoIdentidad ? " - " + h.documentoIdentidad : "";
        return { valor: h.huespedId, texto: nombreCompleto(h) + documento };
      }),
    "Seleccione un huésped"
  );
  $("res-huesped").value = huespedId ? String(huespedId) : "";

  llenarSelect(
    $("res-habitacion"),
    habitaciones.map(function (h) {
      const tipo = buscarTipo(h);
      return { valor: h.habitacionId, texto: "Habitación " + h.numero + (tipo ? " - " + tipo.nombre : "") };
    }),
    "Seleccione una habitación"
  );
  $("res-habitacion").value = "";

  const hoy = hoyTexto();
  $("res-entrada").min = hoy;
  $("res-salida").min = hoy;
  $("res-entrada").value = "";
  $("res-salida").value = "";
  $("res-personas").value = "";
  $("res-estado").value = "Pendiente";

  actualizarMontoReserva();
  $("dlg-reserva").showModal();
}

async function guardarReserva(evento) {
  evento.preventDefault();
  const error = $("res-error");
  error.textContent = "";

  const huespedId = Number($("res-huesped").value);
  const hab = habitacionSeleccionadaEnReserva();
  const entrada = $("res-entrada").value;
  const salida = $("res-salida").value;
  const personasTexto = $("res-personas").value.trim();

  if (!huespedId) {
    error.textContent = "Selecciona un huésped.";
    return;
  }
  if (!hab) {
    error.textContent = "Selecciona una habitación.";
    return;
  }
  if (!entrada || !salida) {
    error.textContent = "Indica la fecha de entrada y la fecha de salida.";
    return;
  }
  if (entrada < hoyTexto()) {
    error.textContent = "La fecha de entrada no puede ser anterior a hoy.";
    return;
  }
  if (calcularNoches(entrada, salida) < 1) {
    error.textContent = "La fecha de salida debe ser posterior a la fecha de entrada.";
    return;
  }
  if (!/^\d+$/.test(personasTexto) || Number(personasTexto) < 1) {
    error.textContent = "La cantidad de personas debe ser un número entero mayor a 0.";
    return;
  }
  const tipo = buscarTipo(hab);
  if (tipo && Number(personasTexto) > tipo.capacidad) {
    error.textContent = "La habitación " + hab.numero + " admite como máximo " + tipo.capacidad + " personas.";
    return;
  }
  if (montoReserva === null) {
    error.textContent = "No se pudo calcular el monto total. Revisa la habitación y las fechas.";
    return;
  }

  await conBotonBloqueado($("res-guardar"), async function () {
    try {
      // Aviso (no bloqueo) si la habitación ya tiene reservas que se cruzan con estas fechas
      const cruces = datos.reservas.filter(function (r) {
        return r.habitacionId === hab.habitacionId &&
          !/cancel/i.test(String(r.estado)) &&
          String(r.fechaEntrada).slice(0, 10) < salida &&
          entrada < String(r.fechaSalida).slice(0, 10);
      });
      if (cruces.length > 0) {
        const acepta = await confirmar(
          "La habitación " + hab.numero + " ya tiene " + cruces.length +
          " reserva(s) que se cruzan con esas fechas. ¿Registrar la reserva de todas formas?"
        );
        if (!acepta) return;
      }

      await api(RUTAS.reservas, "POST", {
        huespedId: huespedId,
        habitacionId: hab.habitacionId,
        fechaEntrada: entrada,
        fechaSalida: salida,
        cantidadPersonas: Number(personasTexto),
        montoTotal: montoReserva,
        estado: "Pendiente"
      });

      $("dlg-reserva").close();
      mostrarMensaje(
        "ok",
        "Reserva registrada para " + nombreCompleto(buscarHuespedPorId(huespedId)) +
        " en la habitación " + hab.numero + ". Monto total: " + formatearBs(montoReserva) + "."
      );
      await cargarReservas();
    } catch (e) {
      error.textContent = e.message;
    }
  });
}

/* ==========================================================
   12. Eventos iniciales
   ========================================================== */

function iniciar() {
  // Ingreso con tenant
  $("form-inicio").addEventListener("submit", ingresar);
  $("btn-salir").addEventListener("click", salir);

  // Menú
  document.querySelectorAll("nav button").forEach(function (b) {
    b.addEventListener("click", function () { mostrarPantalla(b.dataset.pantalla); });
  });

  // Tipos de habitación
  $("tip-nuevo").addEventListener("click", function () { abrirFormTipo(null); });
  $("tip-recargar").addEventListener("click", cargarTipos);
  $("form-tipo").addEventListener("submit", guardarTipo);
  $("tip-cancelar").addEventListener("click", function () { $("dlg-tipo").close(); });

  // Habitaciones
  $("hab-nueva").addEventListener("click", function () { abrirFormHabitacion(null); });
  $("hab-recargar").addEventListener("click", cargarHabitaciones);
  $("hab-buscar").addEventListener("input", dibujarHabitaciones);
  $("hab-filtro-tipo").addEventListener("change", dibujarHabitaciones);
  $("hab-filtro-estado").addEventListener("change", dibujarHabitaciones);
  $("hab-filtro-piso").addEventListener("change", dibujarHabitaciones);
  $("hab-tipo").addEventListener("change", actualizarPrecioFormulario);
  $("form-habitacion").addEventListener("submit", guardarHabitacion);
  $("hab-cancelar").addEventListener("click", function () { $("dlg-habitacion").close(); });

  $("form-estado").addEventListener("submit", guardarEstadoHabitacion);
  $("est-cancelar").addEventListener("click", function () { $("dlg-estado").close(); });

  // Huéspedes
  $("hue-nuevo").addEventListener("click", function () { abrirFormHuesped(null); });
  $("hue-recargar").addEventListener("click", cargarHuespedes);
  $("hue-buscar").addEventListener("input", dibujarHuespedes);
  $("form-huesped").addEventListener("submit", guardarHuesped);
  $("hue-cancelar").addEventListener("click", function () { $("dlg-huesped").close(); });

  // Huésped registrado -> continuar con la reserva
  $("hc-continuar").addEventListener("click", continuarConReserva);
  $("hc-cerrar").addEventListener("click", function () { $("dlg-huesped-creado").close(); });

  // Reservas
  $("res-nueva").addEventListener("click", function () { abrirFormReserva(null); });
  $("res-recargar").addEventListener("click", cargarReservas);
  $("res-habitacion").addEventListener("change", actualizarMontoReserva);
  $("res-entrada").addEventListener("change", actualizarMontoReserva);
  $("res-salida").addEventListener("change", actualizarMontoReserva);
  $("form-reserva").addEventListener("submit", guardarReserva);
  $("res-cancelar").addEventListener("click", function () { $("dlg-reserva").close(); });

  // Limpieza
  $("lim-recargar").addEventListener("click", cargarLimpieza);
  $("lim-filtro-estado").addEventListener("change", dibujarLimpiezas);
  $("form-limpieza").addEventListener("submit", guardarLimpieza);
  $("limp-cancelar").addEventListener("click", function () { $("dlg-limpieza").close(); });

  // Si ya se ingresó en esta pestaña, se entra directamente; si no, se muestra el inicio
  if (obtenerTenant()) {
    mostrarAplicacion();
  } else {
    mostrar("pantalla-inicio", true);
    mostrar("aplicacion", false);
  }
}

document.addEventListener("DOMContentLoaded", iniciar);
