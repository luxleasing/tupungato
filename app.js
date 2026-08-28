// =========================================================================
// SCRIPT SISTEMA DE MONITOREO DE ACTIVOS URBANOS V1- LUX L - NPL 2026
// =========================================================================

// 1. DICCIONARIO DE MAPAS BASE Y CONFIGURACIÓN INICIAL
const ESTILOS_MAPA = {
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    osm: {
        "version": 8,
        "sources": {
            "osm-tiles": {
                "type": "raster",
                "tiles": ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
                "tileSize": 256,
                "attribution": "© OpenStreetMap contributors"
            }
        },
        "layers": [{ "id": "osm-layer", "type": "raster", "source": "osm-tiles", "minzoom": 0, "maxzoom": 19 }]
    },
    satellite: {
        "version": 8,
        "sources": {
            "satellite-tiles": {
                "type": "raster",
                "tiles": ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                "tileSize": 256,
                "attribution": "Tiles © Esri"
            }
        },
        "layers": [{ "id": "satellite-layer", "type": "raster", "source": "satellite-tiles", "minzoom": 0, "maxzoom": 24 }]
    },
        argenmap: {
        "version": 8,
        "sources": {
            "argenmap-tiles": {
                "type": "raster",
                "tiles": ["https://wms.ign.gob.ar/geoserver/capabaseargenmap/gwc/service/wmts?request=GetCapabilities"],
                "tileSize": 256,
                "attribution": "© IGN Argentina"
            }
        },
        "layers": [{ "id": "argenmap-layer", "type": "raster", "source": "argenmap-tiles", "minzoom": 0, "maxzoom": 24 }]
    }
};

// estiloActual para que apunte por defecto a 'osm' en la carga inicial
let estiloActual = 'osm'; 

const map = new maplibregl.Map({
    container: 'map',
    style: ESTILOS_MAPA[estiloActual], 
    center: [-69.14, -33.37], 
    zoom: 13,
    preserveDrawingBuffer: true 
});



// 1.1 Definición de la base de  GeoServer
const geoServerBase = "http://localhost:8090/geoserver/visor_rivadavia/ows?service=WFS&version=1.0.0&request=GetFeature";

// 1.2 Rutas origen de datos (GeoServer y archivos locales)
const FUENTES_DATA = {
    // Capa GeoServer (Espacio de trabajo: 'visor_rivadavia')
    // arbolado: `${geoServerBase}&typeName=visor_rivadavia:arbolado_ej_2&outputFormat=application/json&srsName=EPSG:4326`,
    
    // Capas locales .geojson
    luminarias: "./luminarias_tupungato_wgs44.geojson",

    vialidades: "./vialidad_ej_4.geojson",

    distritos: "./distritos_riv_ide.geojson"
};

// 1.3 Estructuras iniciales para control de estado y KPIs
const geojsonVacio = { "type": "FeatureCollection", "features": [] };

let capasData = { 
    luminarias: geojsonVacio, 
   
    vialidades: geojsonVacio, 
    reclamos: geojsonVacio, 
    cordon: geojsonVacio, 
    banquina_vereda: geojsonVacio, 
    cuneta: geojsonVacio 
};

let distritosData = geojsonVacio;
window.datosActualesParaKPI = capasData;


// Estado de visibilidad inicial de cada capa (True = Prendido)
let visibilidadCapas = { luminarias: true,  vialidades: true, reclamos: true, cordon: true, banquina_vereda: true, cuneta: true };

//2. PARA FECHA DE ACTUALIZACION
function actualizarFechaDesdeCapas() {
    const data = capasData.luminarias;
    let fechaMax = null;

    (data.features || []).forEach(f => {
        const props = f.properties || {};
        // solo fecha_act / FECHA_ACT de capa de luminarias
        const val = props.fecha_act || props.FECHA_ACT || props.Fecha_Act || null;
        if (!val || val === 'null' || val === 'None') return;

        let fecha = null;
        const strVal = String(val).trim();

        // formato  DD/MM/YYYY o DD-MM-YYYY
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(strVal)) {
            const partes = strVal.split(/[\/\-]/);
            const dia = parseInt(partes[0], 10);
            const mes = parseInt(partes[1], 10) - 1;
            const anio = parseInt(partes[2], 10);
            fecha = new Date(anio, mes, dia);
        } else {
            // Formato estándar ISO u otro
            fecha = new Date(strVal);
        }

        if (fecha && !isNaN(fecha.getTime()) && fecha.getFullYear() >= 2020) {
            if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
        }
    });

    const el = document.getElementById('fecha-ultima-actualizacion');
    if (el && fechaMax) {
        el.innerText = fechaMax.toLocaleDateString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    } else if (el) {
        el.innerText = 'Sin dato';
    }
}

// 3. CARGA DE DATOS GEOJSON
map.on('load', () => {
    cargarTodosLosGeoJSON();

    // Comentado: 'draw' no está inicializado. Si se usa MapboxDraw, crear instancia antes.
    // map.on('draw.create', actualizarFiltroPorDibujo);
    // map.on('draw.update', actualizarFiltroPorDibujo);
    // map.on('draw.delete', limpiarFiltroDibujo);
});

function cargarTodosLosGeoJSON() {
    const peticiones = Object.keys(FUENTES_DATA).map(key => 
        fetch(FUENTES_DATA[key])
            .then(res => res.ok ? res.json() : geojsonVacio)
            .then(json => ({ key, data: json }))
            .catch(() => ({ key, data: geojsonVacio }))
    );

    Promise.all(peticiones).then(resultados => {
        resultados.forEach(res => {
            if (res.key === 'distritos') {
                distritosData = res.data;
            } else {
                capasData[res.key] = res.data;
            }
        });
        
        window.datosActualesParaKPI = capasData;
        inyectarFuentesYCapas();
        configurarBotonesPrenderApagar(); 
        calcularKPIs();
        inicializarFiltroDistritos();
        actualizarFechaDesdeCapas();
    
    
// =========================================================================
// POPUP PARA LA CAPA DE SOLICITUDES / RECLAMOS
// =========================================================================
map.off('click', 'reclamos-layer');

map.on('click', 'reclamos-layer', (e) => {
    if (!e.features || e.features.length === 0) return;

    const props = e.features[0].properties || {};
    const coords = e.features[0].geometry.coordinates.slice();

    // 1. Descripción (exacta según columna)
    const descripcion = 
        props['Descripción del reclamo'] || 
        props['Descripción del Reclamo'] || 
        props['Descripcion del reclamo'] || 
        props['Descripcion_del_reclamo'] || 
        props['DESCRIPCION_DEL_RECLAMO'] || 
        props['DESCRIPCIO'] || 
        props.DESCRIPCION || 
        props.descripcion || 
        'Sin descripción disponible';

    // 2. otros campos: Tipo, Usuario, Área
    const tipo = 
        props.Tipo || 
        props.TIPO || 
        props.tipo || 
        props['Tipo de reclamo'] || 
        props['TIPO_RECLAMO'] || 
        'No especificado';

    const usuario = props['Usuario_1'] ;
   
    const area = 
        props['Área'] || 
        props['AREA_RESPONSABLE'] || 
        'Sin área asignada';

    // 3. Fechas
    const fecha = props.FECHA || props.fecha || props.Fecha || props.FECHA_ING || props.fecha_ing || 'Sin dato';
    const fechaSolucion = props['Fecha Solución'] || 'Pendiente / En proceso';

    while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
        coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
    }

    // Estructura HTML expandida con Tipo, Usuario y Área
    const htmlContent = `
        <div style="font-family: 'Inter', system-ui, sans-serif; padding: 12px; max-width: 300px; color: #0f172a;">
            <!-- Encabezado -->
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 8px; height: 8px; background-color: #ef4444; border-radius: 50%;"></span>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #dc2626;">Detalle del Reclamo</span>
                </div>
                <!-- Badge de Tipo -->
                <span style="font-size: 9.5px; font-weight: 700; background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                    ${tipo}
                </span>
            </div>
            
            <!-- Descripción -->
            <div style="margin-bottom: 10px;">
                <span style="display: block; font-size: 9px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 3px;">Descripción del Reclamo</span>
                <p style="font-size: 11.5px; line-height: 1.4; color: #1e293b; margin: 0; font-weight: 500; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #f1f5f9;">
                    ${descripcion}
                </p>
            </div>

            <!-- Información Operativa: Usuario y Área -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px;">
                <div style="background-color: #f8fafc; padding: 6px 8px; border-radius: 6px; border: 1px solid #f1f5f9;">
                    <span style="display: block; font-size: 8.5px; font-weight: 600; text-transform: uppercase; color: #64748b;">Área</span>
                    <span style="font-size: 10.5px; font-weight: 600; color: #334155;">${area}</span>
                </div>
                <div style="background-color: #f8fafc; padding: 6px 8px; border-radius: 6px; border: 1px solid #f1f5f9;">
                    <span style="display: block; font-size: 8.5px; font-weight: 600; text-transform: uppercase; color: #64748b;">Usuario</span>
                    <span style="font-size: 10.5px; font-weight: 600; color: #334155;">${usuario}</span>
                </div>
            </div>

            <!-- Fechas -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background-color: #f1f5f9; padding: 6px 8px; border-radius: 6px;">
                <div>
                    <span style="display: block; font-size: 8.5px; font-weight: 600; text-transform: uppercase; color: #64748b;">Fecha</span>
                    <span style="font-size: 10.5px; font-weight: 700; color: #0f172a; font-family: monospace;">${fecha}</span>
                </div>
                <div>
                    <span style="display: block; font-size: 8.5px; font-weight: 600; text-transform: uppercase; color: #64748b;">Fecha Solución</span>
                    <span style="font-size: 10.5px; font-weight: 700; color: #059669; font-family: monospace;">${fechaSolucion}</span>
                </div>
            </div>
        </div>
    `;

    new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '310px',
        className: 'custom-solicitudes-popup'
    })
    .setLngLat(coords)
    .setHTML(htmlContent)
    .addTo(map);
});

    
    
    
    
    });
    
}

// 4. CARGAR CAPAS
function inyectarFuentesYCapas() {

    // --- 1. CORDÓN ---
    if (!map.getSource('cordon-source')) {
        map.addSource('cordon-source', { type: 'geojson', data: capasData.cordon });
        map.addLayer({
            id: 'cordon-layer', type: 'line', source: 'cordon-source',
            paint: { 'line-color': '#f59e0b', 'line-width': 1.5 },
            layout: { 'visibility': visibilidadCapas.cordon ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' }
        });
    }

    // --- 2. BANQUINA / VEREDA ---
    if (!map.getSource('banquina-vereda-source')) {
        map.addSource('banquina-vereda-source', { type: 'geojson', data: capasData.banquina_vereda });
        map.addLayer({
            id: 'banquina-vereda-layer', type: 'line', source: 'banquina-vereda-source',
            paint: { 'line-color': '#6c716f', 'line-width': 1.5 },
            layout: { 'visibility': visibilidadCapas.banquina_vereda ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' }
        });
    }

    // --- 3. CUNETA ---
    if (!map.getSource('cuneta-source')) {
        map.addSource('cuneta-source', { type: 'geojson', data: capasData.cuneta });
        map.addLayer({
            id: 'cuneta-layer', type: 'line', source: 'cuneta-source',
            paint: { 'line-color': '#5162c7', 'line-width': 1.5 },
            layout: { 'visibility': visibilidadCapas.cuneta ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' }
        });
    }


// --- 4. Vialidades ('superficie') ---
if (!map.getSource('vialidades-source')) {
    map.addSource('vialidades-source', { type: 'geojson', data: capasData.vialidades });
    
    map.addLayer({
        id: 'vialidades-layer',
        type: 'line',
        source: 'vialidades-source',
        paint: {
            'line-width': 3.5,
            'line-color': [
                'match',
                ['upcase', ['coalesce', ['get', 'superficie'], ['get', 'SUPERFICIE'], 'SIN DATO']],
                
                // Celeste para Pavimentada
                'PAVIMENTADA', '#2074da', 
                
                // Naranja para Consolidada
                'CONSOLIDADA', '#22c78a', 
                
                // Gris para Tierra y el resto (incluyendo nulos/sin dato)
                'TIERRA', '#d89522',
                '#888888' // Color por defecto 
            ]
        },
        layout: {
            'visibility': visibilidadCapas.vialidades ? 'visible' : 'none',
            'line-cap': 'round',
            'line-join': 'round'
        }
    });
}





    // --- 4. Luminarias ( 'tipo', 'TIPO' o 'tecnologia') ---
    if (!map.getSource('luminarias-source')) {
        map.addSource('luminarias-source', { type: 'geojson', data: capasData.luminarias });
        map.addLayer({
            id: 'luminarias-layer', type: 'circle', source: 'luminarias-source',
            paint: {
                'circle-color': ['match', ['coalesce', ['get', 'tipo'], ['get', 'TIPO'], ['get', 'tecnologia'], ['get', 'tipologia']], 'LED', '#22eff6', 'SAP', '#e2f916', '#e6b290'],
                'circle-radius': 4, 'circle-stroke-width': 0.8, 'circle-stroke-color': '#0f172a'
            },
            layout: { 'visibility': visibilidadCapas.luminarias ? 'visible' : 'none' }
        });
    }

    // --- 5. Reclamos ---
    if (!map.getSource('reclamos-source')) {
        map.addSource('reclamos-source', { type: 'geojson', data: capasData.reclamos });
        map.addLayer({
            id: 'reclamos-layer', type: 'circle', source: 'reclamos-source',
            paint: { 'circle-color': '#ef4444', 'circle-radius': 7, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' },
            layout: { 'visibility': visibilidadCapas.reclamos ? 'visible' : 'none' }
        });
    }



// -------------------------------------------------------------
// FICHA LATERAL: click dinámicos en el recuadro de Street View
// -------------------------------------------------------------

const capasMapeo = [
    'luminarias-layer', 
    
    'vialidades-layer', 
    'cordon-layer', 
    'banquina-vereda-layer', 
    'cuneta-layer', 
    'reclamos-layer'
];

// Helper para actualizar y controlar visibilidad de campos opcionales / expandidos
function setCampo(idInfo, idLabel, valor, textoLabel) {
    const elInfo = document.getElementById(idInfo);
    const elLabel = document.getElementById(idLabel);

    if (elInfo) elInfo.innerText = valor && valor !== '' ? valor : '-';
    if (elLabel && textoLabel) elLabel.innerText = textoLabel;

    // Ocultar fila o elementos si no hay dato válido 
    const sinDato = !valor || valor === '-' || valor === 'Sin Dato' || valor === 'N/A' || valor === 'No asignado';
    
    if (elInfo) {
        if (sinDato) {
            elInfo.classList.add('hidden');
            if (elLabel) elLabel.classList.add('hidden');
        } else {
            elInfo.classList.remove('hidden');
            if (elLabel) elLabel.classList.remove('hidden');
        }
    }
}

capasMapeo.forEach(layerId => {
    
    map.on('click', layerId, (e) => {
        if (!e.features || e.features.length === 0) return;
        
        const props = e.features[0].properties || {};
        const capaOrigen = e.features[0].layer.id;

        // Reset de visibilidad de etiquetas globales
        const labelIdEl = document.getElementById('label-id');
        const labelElemEl = document.getElementById('label-elemento');
        if (labelIdEl) labelIdEl.innerText = 'ID Elemento';
        if (labelElemEl) labelElemEl.innerText = 'Elemento';

       

        // -------------------------------------------------------------
        // 2. CAPA VIALIDADES (vialidad_ej_4)
        // -------------------------------------------------------------
         else if (capaOrigen === 'vialidades-layer') {
            document.getElementById('info-id').innerText = props.osm_id || props.OSM_ID || props.id || 'N/A';
            document.getElementById('info-elemento').innerText = 'Vialidad';

            setCampo('info-tipo', 'label-tipo', props.nombre || props.NOMBRE, 'Nombre');
            setCampo('info-potencia', 'label-potencia', props.ZONA || props.zona, 'Zona');
            setCampo('info-marca', 'label-marca', props.superficie || props.SUPERFICIE, 'Mat. Calzada');
            setCampo('info-modelo', 'label-modelo', props.km || props.KM, 'KM');
            setCampo('info-calle', 'label-calle', props.sentido || props.SENTIDO, 'Sentido');
            setCampo('info-soporte', 'label-soporte', props.jerarquia || props.JERARQUIA, 'Jerarquía');

            setCampo('info-funcion', 'label-funcion', null, '-');
            setCampo('info-brazo', 'label-brazo', null, '-');
            setCampo('info-streetview', 'label-streetview', null, '-');
            setCampo('info-fecha-act', 'label-fecha-act', null, '-');

        // -------------------------------------------------------------
        // 3. CAPA CORDÓN
        // -------------------------------------------------------------
        } else if (capaOrigen === 'cordon-layer') {
            document.getElementById('info-id').innerText = props.id || props.ID || 'N/A';
            document.getElementById('info-elemento').innerText = 'Cordón';

            setCampo('info-tipo', 'label-tipo', props.cordon || props.CORDON, 'Cordón');
            setCampo('info-potencia', 'label-potencia', props.cord_estado || props.CORD_ESTADO, 'Estado Cordón');
            setCampo('info-marca', 'label-marca', props.km_cordon || props.KM_CORDON, 'KM Cordón');
            setCampo('info-modelo', 'label-modelo', props.lado || props.LADO, 'Lado');
            setCampo('info-calle', 'label-calle', props.fecha || props.FECHA, 'Fecha');
            setCampo('info-soporte', 'label-soporte', null, '-');

            setCampo('info-funcion', 'label-funcion', null, '-');
            setCampo('info-brazo', 'label-brazo', null, '-');
            setCampo('info-streetview', 'label-streetview', null, '-');
            setCampo('info-fecha-act', 'label-fecha-act', null, '-');

        // -------------------------------------------------------------
        // 4. CAPA BANQUINA / VEREDA
        // -------------------------------------------------------------
        } else if (capaOrigen === 'banquina-vereda-layer') {
            document.getElementById('info-id').innerText = props.id || props.ID || 'N/A';
            document.getElementById('info-elemento').innerText = 'Banquina / Vereda';

            setCampo('info-tipo', 'label-tipo', props.banq_vrda || props.BANQ_VRDA, 'Banq. / Vereda');
            setCampo('info-potencia', 'label-potencia', props.b_v_estado || props.B_V_ESTADO, 'Estado B/V');
            setCampo('info-marca', 'label-marca', props.km || props.KM, 'KM');
            setCampo('info-modelo', 'label-modelo', props.km_b_v || props.KM_B_V, 'KM B/V');
            setCampo('info-calle', 'label-calle', props.lado || props.LADO, 'Lado');
            setCampo('info-soporte', 'label-soporte', props.fecha || props.FECHA, 'Fecha');

            setCampo('info-funcion', 'label-funcion', null, '-');
            setCampo('info-brazo', 'label-brazo', null, '-');
            setCampo('info-streetview', 'label-streetview', null, '-');
            setCampo('info-fecha-act', 'label-fecha-act', null, '-');

        // -------------------------------------------------------------
        // 5. CAPA CUNETA
        // -------------------------------------------------------------
        } else if (capaOrigen === 'cuneta-layer') {
            document.getElementById('info-id').innerText = props.id || props.ID || 'N/A';
            document.getElementById('info-elemento').innerText = 'Cuneta';

            setCampo('info-tipo', 'label-tipo', props.cuneta || props.CUNETA, 'Cuneta');
            setCampo('info-potencia', 'label-potencia', props.cun_mat || props.CUN_MAT, 'Material');
            setCampo('info-marca', 'label-marca', props.km_cuneta || props.KM_CUNETA, 'KM Cuneta');
            setCampo('info-modelo', 'label-modelo', props.lado || props.LADO, 'Lado');
            setCampo('info-calle', 'label-calle', props.fecha || props.FECHA, 'Fecha');
            setCampo('info-soporte', 'label-soporte', null, '-');

            setCampo('info-funcion', 'label-funcion', null, '-');
            setCampo('info-brazo', 'label-brazo', null, '-');
            setCampo('info-streetview', 'label-streetview', null, '-');
            setCampo('info-fecha-act', 'label-fecha-act', null, '-');

        // -------------------------------------------------------------
        // 6. CAPA RECLAMOS (reclamos_rv)
        // -------------------------------------------------------------
        } else if (capaOrigen === 'reclamos-layer') {
            document.getElementById('info-id').innerText = props.id || props.ID || 'N/A';
            document.getElementById('info-elemento').innerText = 'Reclamo';

        
            const valorUsuario = props.Usuario || props.USUARIO || props.usuario || props['Usuario '] || props.USER || props.User || props.USUARIO_REG || props.USR;
            const descReclamo = props['Descripción del reclamo'] || props['Descripción del Reclamo'] || props['Descripcion del reclamo'] || props['DESCRIPCION_DEL_RECLAMO'] || props.DESCRIPCION || props.descripcion;

            setCampo('info-tipo', 'label-tipo', props.Tipo || props.TIPO || props.tipo, 'Tipo');
            setCampo('info-potencia', 'label-potencia', valorUsuario, 'Usuario');
            setCampo('info-marca', 'label-marca', props.Área || props.Area || props.AREA || props.area, 'Área');
            setCampo('info-modelo', 'label-modelo', descReclamo, 'Descripción');
            setCampo('info-calle', 'label-calle', props.Fecha || props.FECHA || props.fecha, 'Fecha');
            setCampo('info-soporte', 'label-soporte', props['Fecha Solución'] || props.FECHA_SOLUCION || props.fecha_solucion, 'Fecha Solución');

            setCampo('info-funcion', 'label-funcion', null, '-');
            setCampo('info-brazo', 'label-brazo', null, '-');
            setCampo('info-streetview', 'label-streetview', null, '-');
            setCampo('info-fecha-act', 'label-fecha-act', null, '-');

        // -------------------------------------------------------------
        // 7. COMPORTAMIENTO ESTÁNDAR (Luminarias y resto)
        // -------------------------------------------------------------
        } else {
            document.getElementById('info-id').innerText = props.id || props.ID || 'N/A';
            document.getElementById('info-elemento').innerText = props.elemento || props.ELEMENTO || '-';

            setCampo('info-tipo', 'label-tipo', props.tecnologia || props.TECNOLOGIA || props.tipo || props.TIPO || props.tipologia, 'Tecnología');
            setCampo('info-potencia', 'label-potencia', props.potencia || props.POTENCIA, 'Potencia');
            setCampo('info-marca', 'label-marca', props.marca || props.MARCA, 'Marca');
            setCampo('info-modelo', 'label-modelo', props.modelo || props.MODELO, 'Modelo');
            setCampo('info-calle', 'label-calle', props.calle || props.CALLE, 'Calle');
            setCampo('info-soporte', 'label-soporte', props.soporte || props.SOPORTE, 'Soporte');

            setCampo('info-funcion', 'label-funcion', props.funcion || props.FUNCION, 'Función');
            setCampo('info-brazo', 'label-brazo', props.brazo || props.BRAZO, 'Brazo');
            setCampo('info-streetview', 'label-streetview', props.streetview || props.STREETVIEW, 'StreetView');
            setCampo('info-fecha-act', 'label-fecha-act', props.fecha_act || props.FECHA_ACT, 'Fecha Act.');
        }

        // Lógica de Street View -Puntos y Líneas
        const iframe = document.getElementById('street-view-frame');
        const placeholder = document.getElementById('sv-placeholder');

        let lat, lon;
        if (e.features[0].geometry.type === 'Point') {
            const coords = e.features[0].geometry.coordinates;
            lon = coords[0];
            lat = coords[1];
        } else if (e.features[0].geometry.type === 'LineString' || e.features[0].geometry.coordinates.length > 0) {
            const lineCoords = e.features[0].geometry.coordinates;
            const puntoMedio = lineCoords[Math.floor(lineCoords.length / 2)];
            
            lon = Array.isArray(puntoMedio) ? (Array.isArray(puntoMedio[0]) ? puntoMedio[0][0] : puntoMedio[0]) : puntoMedio;
            lat = Array.isArray(puntoMedio) ? (Array.isArray(puntoMedio[1]) ? puntoMedio[1][0] : puntoMedio[1]) : puntoMedio;
        }

        if (lat && lon) {
            const strLon = lon.toString().replace(',', '.');
            const strLat = lat.toString().replace(',', '.');

            window.activoSeleccionadoLat = strLat;
            window.activoSeleccionadoLon = strLon;

            destacarPuntoEnMapa(parseFloat(strLon), parseFloat(strLat));

            if (placeholder) placeholder.classList.add('hidden');
            if (iframe) {
                iframe.classList.remove('hidden');
                iframe.src = `https://maps.google.com/maps?q=${strLat},${strLon}&cbll=${strLat},${strLon}&layer=c&panoid=&cbp=12,0,0,0,0&source=embed&output=svembed`;
            }

            const btn = document.getElementById('btn-streetview');
            if (btn) {
                btn.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${strLat},${strLon}`;
                btn.classList.remove('pointer-events-none', 'opacity-50');
            }
        }
    });

    map.on('mouseenter', layerId, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', layerId, () => map.getCanvas().style.cursor = '');
});

// Click fuera para deseleccionar
map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, {
        layers: capasMapeo
    });
    if (!features || features.length === 0) {
        limpiarSeleccion();
    }
});
}

// Función para demarcar visualmente el activo seleccionado 
function destacarPuntoEnMapa(lng, lat) {
    const sourceId = 'source-seleccion-activo';
    const layerId = 'layer-seleccion-activo';
    const glowId = 'layer-seleccion-glow';

    const geojsonPunto = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] }
        }]
    };

    if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(geojsonPunto);
    } else {
        map.addSource(sourceId, { type: 'geojson', data: geojsonPunto });

        // Simbologia de seleccion, borde exterior 'difuso'
        map.addLayer({
            id: glowId,
            type: 'circle',
            source: sourceId,
            paint: {
                'circle-radius': 22,
                'circle-color': '#22d3ee',
                'circle-opacity': 0.15,
                'circle-stroke-width': 0
            }
        });

        // Anillo medio
        map.addLayer({
            id: 'layer-seleccion-ring',
            type: 'circle',
            source: sourceId,
            paint: {
                'circle-radius': 16,
                'circle-color': 'transparent',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#22d3ee',
                'circle-stroke-opacity': 0.6
            }
        });

        // Punto central sólido
        map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint: {
                'circle-radius': 8,
                'circle-color': '#31fff5',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#22d3ee'
            }
        });
    }
}

function limpiarSeleccion() {
    const sourceId = 'source-seleccion-activo';
    if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData({ type: 'FeatureCollection', features: [] });
    }
}






// =========================================================================
// 5. SISTEMA DE ENCENDIDO, APAGADO Y MENÚS FIJOS POR BOTÓN (INDIVIDUAL)
// =========================================================================
function configurarBotonesPrenderApagar() {

    // Función para configurar cada botón de forma independiente
    const configurarBotonIndividual = (btnId, dropId, layerId, keyVisibilidad, clasesOn) => {
        const domBtn = document.getElementById(btnId);
        if (!domBtn) return;

        // Limpiar listeners previos 
        const nuevoBtn = domBtn.cloneNode(true);
        domBtn.parentNode.replaceChild(nuevoBtn, domBtn);

        const targetDropdown = dropId ? document.getElementById(dropId) : null;
        const clasesOff = ['border-slate-300', 'dark:border-slate-800', 'bg-transparent', 'opacity-40'];

        // Actualizador visual del botón
        const actualizarEstiloBoton = (activo) => {
            if (activo) {
                nuevoBtn.classList.remove(...clasesOff);
                nuevoBtn.classList.add(...clasesOn);
            } else {
                nuevoBtn.classList.remove(...clasesOn);
                nuevoBtn.classList.add(...clasesOff);
            }
        };

        // Evento de clic - lógica de 3 estados (revisar)
        nuevoBtn.addEventListener('click', (event) => {
            event.stopPropagation();

            const capaEstaPrendida = visibilidadCapas[keyVisibilidad] === true;
            const menuEstaAbierto = targetDropdown ? !targetDropdown.classList.contains('hidden') : false;

            // Cerrar todos los demás desplegables
            document.querySelectorAll('.dropdown-content').forEach(drop => {
                if (drop.id !== dropId) drop.classList.add('hidden');
            });

            if (capaEstaPrendida && !menuEstaAbierto) {
                // ESTADO 1: Capa prendida, desplegable cerrado -> ABRIR desplegable
                if (targetDropdown) {
                    targetDropdown.classList.remove('hidden');
                }
            } else if (capaEstaPrendida && menuEstaAbierto) {
                // ESTADO 2: Capa prendida, menú desplegable -> APAGAR CAPA y cerrar desplegable
                visibilidadCapas[keyVisibilidad] = false;
                if (targetDropdown) targetDropdown.classList.add('hidden');
                
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', 'none');
                }
                actualizarEstiloBoton(false);
            } else {
                // ESTADO 3: Capa apagada -> PRENDER CAPA sin desplegable
                visibilidadCapas[keyVisibilidad] = true;
                if (targetDropdown) targetDropdown.classList.add('hidden');
                
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', 'visible');
                }
                actualizarEstiloBoton(true);
            }
        });

        // Guardar referencia para el botón maestro
        nuevoBtn.actualizarVisual = actualizarEstiloBoton;
    };

    // 1. Configuración para cada elemento
    configurarBotonIndividual(
        'btn-mod-luminarias', 'drop-luminarias', 'luminarias-layer', 'luminarias', 
        ['border-cyan-400/80', 'bg-cyan-500/10', 'opacity-100']
    );

 

    configurarBotonIndividual(
        'btn-mod-vialidades', 'drop-vialidades', 'vialidades-layer', 'vialidades', 
        ['border-indigo-500/40', 'bg-indigo-500/10', 'opacity-100']
    );

    // === LATERAL VIAL: controla 3 capas (cordon, banquina_vereda, cuneta) ===
    const btnCordon = document.getElementById('btn-mod-cordon');
    if (btnCordon) {
        const nuevoBtnCordon = btnCordon.cloneNode(true);
        btnCordon.parentNode.replaceChild(nuevoBtnCordon, btnCordon);
        
        const dropCordon = document.getElementById('drop-cordon');
        const clasesOnCordon = ['border-amber-500/40', 'bg-amber-500/10', 'opacity-100'];
        const clasesOffCordon = ['border-slate-300', 'dark:border-slate-800', 'bg-transparent', 'opacity-40'];
        
        const actualizarEstiloCordon = (activo) => {
            if (activo) {
                nuevoBtnCordon.classList.remove(...clasesOffCordon);
                nuevoBtnCordon.classList.add(...clasesOnCordon);
            } else {
                nuevoBtnCordon.classList.remove(...clasesOnCordon);
                nuevoBtnCordon.classList.add(...clasesOffCordon);
            }
        };
        
        const capasLateral = ['cordon-layer', 'banquina-vereda-layer', 'cuneta-layer'];
        const keysLateral = ['cordon', 'banquina_vereda', 'cuneta'];
        
        nuevoBtnCordon.addEventListener('click', (event) => {
            event.stopPropagation();
            
            const algunaActiva = keysLateral.some(key => visibilidadCapas[key] === true);
            const menuAbierto = dropCordon ? !dropCordon.classList.contains('hidden') : false;
            
            document.querySelectorAll('.dropdown-content').forEach(drop => {
                if (drop.id !== 'drop-cordon') drop.classList.add('hidden');
            });
            
            if (algunaActiva && !menuAbierto) {
                if (dropCordon) dropCordon.classList.remove('hidden');
            } else if (algunaActiva && menuAbierto) {
                keysLateral.forEach((key, idx) => {
                    visibilidadCapas[key] = false;
                    if (map.getLayer(capasLateral[idx])) {
                        map.setLayoutProperty(capasLateral[idx], 'visibility', 'none');
                    }
                });
                if (dropCordon) dropCordon.classList.add('hidden');
                actualizarEstiloCordon(false);
            } else {
                keysLateral.forEach((key, idx) => {
                    visibilidadCapas[key] = true;
                    if (map.getLayer(capasLateral[idx])) {
                        map.setLayoutProperty(capasLateral[idx], 'visibility', 'visible');
                    }
                });
                if (dropCordon) dropCordon.classList.add('hidden');
                actualizarEstiloCordon(true);
            }
        });
        
        nuevoBtnCordon.actualizarVisual = actualizarEstiloCordon;
    }

    configurarBotonIndividual(
        'btn-mod-reclamos', 'drop-reclamos', 'reclamos-layer', 'reclamos', 
        ['border-red-500/30', 'bg-red-500/10', 'opacity-100']
    );

    // 2. Configurar el botón maestro "Activar / Desactivar Todas"
    const btnTodos = document.getElementById('btn-mod-todos');
    if (btnTodos) {
        const nuevoBtnTodos = btnTodos.cloneNode(true);
        btnTodos.parentNode.replaceChild(nuevoBtnTodos, btnTodos);


               const clasesOnTodos = ['border-slate-200/80', 'bg-slate-700/50', 'opacity-100'];
        const clasesOffTodos = ['border-slate-700/60', 'bg-slate-800/40', 'opacity-40'];
        const actualizarVisualTodos = (activo) => {
            if (activo) {
                nuevoBtnTodos.classList.remove(...clasesOffTodos);
                nuevoBtnTodos.classList.add(...clasesOnTodos);
            } else {
                nuevoBtnTodos.classList.remove(...clasesOnTodos);
                nuevoBtnTodos.classList.add(...clasesOffTodos);
            }
        };
        actualizarVisualTodos(true);

        const llavesCapas = ['luminarias',  'vialidades', 'cordon', 'banquina_vereda', 'cuneta', 'reclamos'];
        const idsBotones = {
            luminarias: 'btn-mod-luminarias',
            
            vialidades: 'btn-mod-vialidades',
            cordon: 'btn-mod-cordon',
            reclamos: 'btn-mod-reclamos'
        };
                const idsCapasMap = {
            luminarias: 'luminarias-layer',
            
            vialidades: 'vialidades-layer',
            cordon: 'cordon-layer',
            banquina_vereda: 'banquina-vereda-layer',
            cuneta: 'cuneta-layer',
            reclamos: 'reclamos-layer'
        };

        nuevoBtnTodos.addEventListener('click', (event) => {
            event.stopPropagation();
            
            document.querySelectorAll('.dropdown-content').forEach(drop => {
                drop.classList.add('hidden');
            });

            const algunaActiva = llavesCapas.some(key => visibilidadCapas[key] === true);
            const nuevoEstadoGlobal = !algunaActiva;

            llavesCapas.forEach(key => {
                visibilidadCapas[key] = nuevoEstadoGlobal;
                
                const layerId = idsCapasMap[key];
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', nuevoEstadoGlobal ? 'visible' : 'none');
                }

                const el = document.getElementById(idsBotones[key]);
                if (el && typeof el.actualizarVisual === 'function') {
                    el.actualizarVisual(nuevoEstadoGlobal);
                }
                            actualizarVisualTodos(nuevoEstadoGlobal);
            });
        });
    }

    // 3. Control global para cerrar menús al hacer clic fuera
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-content').forEach(drop => {
            drop.classList.add('hidden');
        });
    });

    document.querySelectorAll('.dropdown-content').forEach(drop => {
        drop.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    });
}


// =========================================================================
// 6. ALTERNAR MAPAS BASE Y SINCRONIZACIÓN CON EL TEMA
// =========================================================================
const styleSelect = document.getElementById('map-style-select');

function cambiarEstiloMapa(nuevoEstilo) {
    if (!ESTILOS_MAPA[nuevoEstilo]) return;
    estiloActual = nuevoEstilo;
    
    if (styleSelect.value !== nuevoEstilo) {
        styleSelect.value = nuevoEstilo;
    }

    // 1.  estilo
    map.setStyle(ESTILOS_MAPA[estiloActual]);

    // 2.  'idle' para asegurar que el mapa terminó de renderizar el nuevo estilo
    // 'once' evita que se acumulen eventos 
    map.once('idle', () => {
        inyectarFuentesYCapas();
        
    });
}

// =========================================================================
// 7. TEMA CLARO / OSCURO (Sincronizado con mapas base)
// =========================================================================
const themeToggleBtn = document.getElementById("theme-toggle");
const iconLight = document.getElementById("theme-icon-light");
const iconDark = document.getElementById("theme-icon-dark");

let modoVisual = localStorage.getItem("theme-mode") || "light";

function aplicarModoVisual(modo) {
    modoVisual = modo;

    if (modo === "dark") {
        document.documentElement.classList.add("dark");
        iconLight.classList.remove("hidden");
        iconDark.classList.add("hidden");
    } else {
        document.documentElement.classList.remove("dark");
        iconDark.classList.remove("hidden");
        iconLight.classList.add("hidden");
        
    }

    localStorage.setItem("theme-mode", modo);
}

// Inicializar solo el modo visual 
if (modoVisual === "dark") {
    document.documentElement.classList.add("dark");
} else {
    document.documentElement.classList.remove("dark");
}

//  funcionamiento del boton
styleSelect.addEventListener('change', (e) => {
    cambiarEstiloMapa(e.target.value);
});



// Evento para el botón (Solo cambia el tema)
themeToggleBtn.addEventListener("click", () => {
    const nuevoModo = modoVisual === "dark" ? "light" : "dark";
    aplicarModoVisual(nuevoModo);
    
    if (nuevoModo === "dark" && estiloActual === "osm") cambiarEstiloMapa("dark");
    if (nuevoModo === "light" && estiloActual === "dark") cambiarEstiloMapa("osm");
});




// =========================================================================
// 8. CÁLCULO ESTÁTICO DE KPIs Y FILTROS
// =========================================================================

function calcularKPIs() {

  // ===== LUMINARIAS =====
    const luminarias = capasData.luminarias.features || [];
    //const luminarias = window.datosActualesParaKPI.luminarias.features || [];
    const totalLum = luminarias.length;

    let led = 0;
    let sodio = 0;
    let otrosLum = 0;

    luminarias.forEach(f => {
        const tipo = String(
            f.properties.sap ??
            f.properties.SAP ??
            f.properties.tipo ??
            f.properties.TIPO ??
            f.properties.tecnologia ??
            f.properties.tipologia ??
            ""
        ).trim().toUpperCase();

        if (tipo.includes("LED")) {
            led++;
        } else if (tipo.includes("SAP")) {
            sodio++;
        } else {
            otrosLum++;
        }
    });

    const actualizarDOM = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.innerText = valor;
    };

    actualizarDOM('kpi-total', totalLum.toLocaleString());

    actualizarDOM('kpi-led', 
        `${led.toLocaleString()} (${totalLum ? ((led / totalLum) * 100).toFixed(1) : 0}%)`
    );

    actualizarDOM('kpi-sodio', 
        `${sodio.toLocaleString()} (${totalLum ? ((sodio / totalLum) * 100).toFixed(1) : 0}%)`
    );

    actualizarDOM('kpi-lum-otros', 
        `${otrosLum.toLocaleString()} (${totalLum ? ((otrosLum / totalLum) * 100).toFixed(1) : 0}%)`
    );




// ===== VIALIDADES =====
const viales = capasData.vialidades.features || [];
//const viales = window.datosActualesParaKPI.vialidades.features || [];
let pav = 0, cons = 0, tierra = 0, sinDato = 0;

viales.forEach(f => {
    // 1. Obtener KM
    const km = parseFloat(f.properties.km || f.properties.KM || 0);
    
    // 2.   superficie 
    const rawVal = f.properties.superficie ?? f.properties.SUPERFICIE ?? null;
    
    // Si es nulo, undefined o "SIN DATO"
    let cat = "";
    if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") {
        cat = "SIN DATO";
    } else {
        cat = String(rawVal).trim().toUpperCase();
    }

    // 3. Clasificación
    if (cat.includes("PAVIMENTADA")) {
        pav += km;
    } else if (cat.includes("CONSOLIDADA")) {
        cons += km;
    } else if (cat.includes("TIERRA")) {
        tierra += km;
    } else {
        //  "sin dato" y los nulos 
        sinDato += km;
    }
});

const totalKm = pav + cons + tierra + sinDato;

// Actualizar el DOM
document.getElementById('kpi-vial-total').innerText = totalKm.toFixed(1)+ " km";
document.getElementById('kpi-vial-pav').innerText = pav.toFixed(1)+ " km";
document.getElementById('kpi-vial-cons').innerText = cons.toFixed(1)+ " km";
document.getElementById('kpi-vial-tierra').innerText = tierra.toFixed(1)+ " km";
document.getElementById('kpi-vial-sd').innerText = sinDato.toFixed(1)+ " km";



// ===== LATERAL VIAL =====
    // CORDÓN: sumar km_cordon cuando cordon == 'SI'
    const cordones = capasData.cordon.features || [];
    let kmCordon = 0;
    cordones.forEach(f => {
        const p = f.properties || {};
        const tieneCordon = String(p.cordon || p.CORDON || '').trim().toUpperCase();
        if (tieneCordon === 'SI') {
            kmCordon += parseFloat(p.km_cordon || p.KM_CORDON || 0);
        }
    });

    // BANQUINA/VEREDA: sumar km_b_k cuando banq_vrda == 'SI'
    const banquinas = capasData.banquina_vereda.features || [];
    let kmBanquina = 0;
    banquinas.forEach(f => {
        const p = f.properties || {};
        const tieneBanquina = String(p.banq_vrda || p.BANQ_VRDA || '').trim().toUpperCase();
        if (tieneBanquina === 'SI') {
            kmBanquina += parseFloat(p.km_b_v || p.KM_B_K || 0);
        }
    });

    // CUNETA: sumar km_cuneta cuando cuneta == 'SI'
    const cunetas = capasData.cuneta.features || [];
    let kmCuneta = 0;
    cunetas.forEach(f => {
        const p = f.properties || {};
        const tieneCuneta = String(p.cuneta || p.CUNETA || '').trim().toUpperCase();
        if (tieneCuneta === 'SI') {
            kmCuneta += parseFloat(p.km_cuneta || p.KM_CUNETA || 0);
        }
    });

    const totalKmLateral = kmCordon + kmBanquina + kmCuneta;
    document.getElementById('kpi-cordon-total').innerText = totalKmLateral.toFixed(1) + ' km';

    actualizarDOM('kpi-cordon-con', kmCordon.toFixed(1) + ' km');
    actualizarDOM('kpi-banquina-con', kmBanquina.toFixed(1) + ' km');
    actualizarDOM('kpi-cuneta-con', kmCuneta.toFixed(1) + ' km');


     // ===== SOLICITUDES =====
    const reclamos = capasData.reclamos.features || [];
    const elTotal = document.getElementById('kpi-rec-total');
    if (elTotal) elTotal.innerText = reclamos.length.toLocaleString();

    let recInfra = 0, recMant = 0, recObra = 0, recLed = 0, recRep = 0;
    
    

    reclamos.forEach(f => {
        // campo exacto 
        const raw = f.properties.TIPO_S || f.properties.tipo_s || '';
        const tipoS = String(raw).trim();
        
        // categorias
        if (tipoS === 'Infraestructura') recInfra++;
        else if (tipoS === 'Mantenimiento Operativo') recMant++;
        else if (tipoS === 'Obra / Extension de Red') recObra++;
        else if (tipoS === 'Reconversion LED') recLed++;
        else if (tipoS === 'Reparacion / Reposicion') recRep++;
    });

    // Helper local 
    const setRec = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setRec('kpi-rec-infra', recInfra.toLocaleString());
    setRec('kpi-rec-mant', recMant.toLocaleString());
    setRec('kpi-rec-obra', recObra.toLocaleString());
    setRec('kpi-rec-led', recLed.toLocaleString());
    setRec('kpi-rec-rep', recRep.toLocaleString());
}


// =========================================================================
// FILTRO POR DISTRITOS (puntos en polígono)
// =========================================================================



function puntoEnPoligono(pt, poligono) {
    const x = pt[0], y = pt[1];
    const rings = poligono.type === 'Polygon' ? [poligono.coordinates[0]] : 
                  poligono.type === 'MultiPolygon' ? poligono.coordinates.map(r => r[0]) : [];
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi))
                inside = !inside;
        }
    }
    return inside;
}

function coordsRepresentativas(feature) {
    const g = feature.geometry;
    if (!g) return null;
    if (g.type === 'Point') return g.coordinates;
    if (g.type === 'LineString') return g.coordinates[Math.floor(g.coordinates.length / 2)];
    if (g.type === 'Polygon') return g.coordinates[0][0];
    if (g.type === 'MultiPolygon') return g.coordinates[0][0][0];
    return null;
}

function aplicarFiltroGeometrico(polyGeom) {
    const filtradas = {};
    Object.keys(capasData).forEach(key => {
        const feats = (capasData[key].features || []).filter(f => {
            const pt = coordsRepresentativas(f);
            if (!pt) return false;
            return puntoEnPoligono(pt, polyGeom);
        });
        filtradas[key] = { type: "FeatureCollection", features: feats };
        const s = `${key}-source`;
        if (map.getSource(s)) map.getSource(s).setData(filtradas[key]);
    });
    window.datosActualesParaKPI = filtradas;
    calcularKPIs();

    if (map.getSource('distritos-source')) {
        map.getSource('distritos-source').setData({
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: polyGeom, properties: {} }]
        });
    }
}

function aplicarFiltroDistrito(nombreDistrito) {
    if (nombreDistrito === 'Todos') {
        Object.keys(capasData).forEach(key => {
            const s = `${key}-source`;
            if (map.getSource(s)) map.getSource(s).setData(capasData[key]);
        });
        if (map.getSource('distritos-source')) map.getSource('distritos-source').setData(distritosData);
        window.datosActualesParaKPI = capasData;
        calcularKPIs();
        return;
    }
    
    const distritoFeat = (distritosData.features || []).find(f => {
        const p = f.properties || {};
        return (p.nombre || p.NOMBRE || p.distrito || p.DISTRITO || p.name || '') === nombreDistrito;
    });
    
    if (!distritoFeat) return;
    aplicarFiltroGeometrico(distritoFeat.geometry);
}

function actualizarFiltroPorDibujo(e) {
    const features = draw.getAll().features;
    if (features.length === 0) return;
    aplicarFiltroGeometrico(features[features.length - 1].geometry);
}

function limpiarFiltroDibujo() {
    aplicarFiltroDistrito('Todos');
}

function inicializarFiltroDistritos() {
    const select = document.getElementById('filtro-distrito');
    if (!select) return;
    
    const distritos = distritosData.features || [];
    const nombres = [...new Set(distritos
        .map(f => f.properties.nombre || f.properties.NOMBRE || f.properties.distrito || f.properties.DISTRITO || f.properties.name || '')
        .filter(n => n)
    )].sort((a, b) => a.localeCompare(b));
    
    nombres.forEach(nombre => {
        const op = document.createElement('option');
        op.value = nombre;
        op.innerText = nombre;
        select.appendChild(op);
    });
    
    select.addEventListener('change', (e) => {
        aplicarFiltroDistrito(e.target.value);
    });
}





// =========================================================================
// 9. EXPORTACIÓN A PDF  (MAPA PROPORCIONAL, TÍTULO, ÍCONOS, ENLACE)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const btnPdf = document.getElementById('btn-export-pdf');
    if (!btnPdf) return;

    btnPdf.addEventListener('click', () => {
        //  Captura el mapa y preservamos su relación de aspecto 
        let mapaBase64 = null;
        let aspectHeight = 220; // Altura base por defecto
        try {
            const canvasMapa = map.getCanvas();
            mapaBase64 = canvasMapa.toDataURL('image/png');
            //  proporción del contenedor web (ancho vs alto) para adaptar al PDF
            const mapaDom = document.getElementById('map');
            if (mapaDom && mapaDom.clientWidth > 0) {
                const proporcion = mapaDom.clientHeight / mapaDom.clientWidth;
                aspectHeight = Math.round(714 * proporcion); // ancho del PDF A4
            }
        } catch (e) {
            console.error("No se pudo extraer la imagen del mapa", e);
        }

        // 1. Extraer los KPIs globales actuales del tablero
        const kpiLum = document.getElementById('kpi-total')?.innerText || '0';
        const kpiArb = document.getElementById('kpi-arb-total')?.innerText || '0';
        const kpiVial = document.getElementById('kpi-vial-total')?.innerText || '0';
        const kpiCordon = document.getElementById('kpi-cordon-total')?.innerText || '0';
        const kpiRec = document.getElementById('kpi-rec-total')?.innerText || '0';
        

        
        // 2. Extraer la ficha técnica seleccionada actual de la barra lateral y verificar selección
        const infoId = document.getElementById('info-id')?.innerText || '-';
        const haySeleccion = infoId && infoId !== '-' && infoId.trim() !== '';

        let tablaFichaHtml = '';
        let enlaceGeoHtml = '';

        if (haySeleccion) {
            const infoElemento = document.getElementById('info-elemento')?.innerText || '-';
            const infoTipo = document.getElementById('info-tipo')?.innerText || '-';
            const infoPotencia = document.getElementById('info-potencia')?.innerText || '-';
            const infoMarca = document.getElementById('info-marca')?.innerText || '-';
            const infoModelo = document.getElementById('info-modelo')?.innerText || '-';
            const infoCalle = document.getElementById('info-calle')?.innerText || '-';
            const infoSoporte = document.getElementById('info-soporte')?.innerText || '-';
            const infoFuncion = document.getElementById('info-funcion')?.innerText || '-';
            const infoBrazo = document.getElementById('info-brazo')?.innerText || '-';
            const infoFechaAct = document.getElementById('info-fecha-act')?.innerText || '-';
            
// Generación del enlace a Google Maps
            if (typeof window.activoSeleccionadoLat !== 'undefined' && typeof window.activoSeleccionadoLon !== 'undefined') {
                const mapUrl = `https://www.google.com/maps/search/?api=1&query=${window.activoSeleccionadoLat},${window.activoSeleccionadoLon}`;
                
                enlaceGeoHtml = `
                    <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 15px; margin-bottom: 20px; font-size: 11px;">
                        <div style="font-weight: bold; color: #0369a1; margin-bottom: 4px;">📍 Enlace directo de geolocalización:</div>
                        <a href="${mapUrl}" target="_blank" style="color: #0284c7; text-decoration: underline; word-break: break-all; font-family: monospace; font-weight: bold;">${mapUrl}</a>
                    </div>
                `;
            }

            // Estética para la tabla de atributos
            tablaFichaHtml = `
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); margin-bottom: 25px;">
                    <div style="background-color: #f8fafc; padding: 10px 15px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Parámetros del Componente</span>
                        <span style="font-size: 10px; font-family: monospace; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: bold;">ID: ${infoId}</span>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <tbody>
                            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 12px; color: #64748b; width: 40%;"> Tipo de Elemento</td><td style="padding: 8px 12px; font-weight: bold; color: #1e293b;">${infoElemento}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f5f9; background-color: #fafaf9;"><td style="padding: 8px 12px; color: #64748b;"> Tecnología </td><td style="padding: 8px 12px; font-weight: bold; color: #0f172a;">${infoTipo}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 12px; color: #64748b;"> Potencia </td><td style="padding: 8px 12px; color: #334155;">${infoPotencia}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f5f9; background-color: #fafaf9;"><td style="padding: 8px 12px; color: #64748b;"> Marca / Modelo</td><td style="padding: 8px 12px; color: #334155;">${infoMarca} / ${infoModelo}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 12px; color: #64748b;"> Arteria / Calle</td><td style="padding: 8px 12px; font-weight: bold; color: #1e293b;">${infoCalle}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f5f9; background-color: #fafaf9;"><td style="padding: 8px 12px; color: #64748b;"> Tipo de Soporte</td><td style="padding: 8px 12px; color: #334155;">${infoSoporte}</td></tr>
                            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 12px; color: #64748b;"> Función </td><td style="padding: 8px 12px; color: #334155;">${infoFuncion} (${infoBrazo})</td></tr>
                            <tr><td style="padding: 8px 12px; color: #64748b; background-color: #fafaf9;"> Fecha Act</td><td style="padding: 8px 12px; color: #334155; background-color: #fafaf9;">${infoFechaAct}</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            tablaFichaHtml = `
                <div style="padding: 20px; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; color: #64748b; font-size: 11.5px; margin-bottom: 25px;">
                    ℹ️ <strong>Reporte General:</strong> No se ha seleccionado ningún activo específico en el mapa. Haga clic sobre un punto o línea para incluir su ficha técnica detallada.
                </div>
            `;
        }

        // 3. Crear contenedor HTML oculto adaptado a A4 
        const printContainer = document.createElement('div');
        printContainer.style.position = 'absolute';
        printContainer.style.left = '-9999px';
        printContainer.style.top = '-9999px';
        printContainer.style.width = '794px'; 
        printContainer.style.backgroundColor = '#ffffff';
        printContainer.style.padding = '40px';
        printContainer.style.fontFamily = 'Arial, sans-serif';
        printContainer.style.color = '#1e293b';

        printContainer.innerHTML = `
            <!-- Encabezado Corporativo -->
            <div style="background-color: #040d3d; color: #ffffff; margin: -40px -40px 25px -40px; padding: 25px 40px; border-bottom: 4px solid #5a9cf2;">
                <h1 style="font-size: 20px; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 1px;">Reporte de Activos Urbanos</h1>
                <p style="font-size: 11px; margin: 0; color: #94a3b8;">Municipio de Rivadavia &bull; Sistema de Monitoreo Lux Leasing</p>
            </div>

            <!-- TÍTULO DE INDICADORES TOTALES -->
            <h2 style="font-size: 13px; color: #040d3d; border-left: 4px solid #5a9cf2; padding-left: 8px; text-transform: uppercase; margin-bottom: 12px;">Total de Activos Urbanos</h2>
            <div style="display: flex; gap: 10px; margin-bottom: 25px;">
                <div style="flex: 1; background-color: #ecfeff; border: 1px solid #06b6d4; border-radius: 6px; padding: 10px; text-align: center;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #0891b2; font-weight: bold; margin-bottom: 3px;">Luminarias</div>
                    <div style="font-size: 16px; font-weight: bold; color: #0891b2;">${kpiLum}</div>
                </div>
                <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 3px;">Arbolado</div>
                    <div style="font-size: 16px; font-weight: bold; color: #0f172a;">${kpiArb}</div>
                </div>
                <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 3px;">Vialidades</div>
                    <div style="font-size: 16px; font-weight: bold; color: #0f172a;">${kpiVial}</div>
                </div>
                <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 3px;">Lateral Vial</div>
                    <div style="font-size: 16px; font-weight: bold; color: #0f172a;">${kpiCordon}</div>
                </div>
                <div style="flex: 1; background-color: #fff5f5; border: 1px solid #feb2b2; border-radius: 6px; padding: 10px; text-align: center;">
                    <div style="font-size: 9px; text-transform: uppercase; color: #c53030; font-weight: bold; margin-bottom: 3px;">Solicitudes</div>
                    <div style="font-size: 16px; font-weight: bold; color: #c53030;">${kpiRec}</div>
                </div>
            </div>

            <!-- SECCIÓN: MAPA OPERATIVO EN VIVO (Proporción exacta sin achatarse) -->
            <h2 style="font-size: 13px; color: #040d3d; border-left: 4px solid #5a9cf2; padding-left: 8px; text-transform: uppercase; margin-bottom: 12px;">Vista del Mapa</h2>
            <div style="width: 100%; height: ${aspectHeight}px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 25px; background-color: #f1f5f9;">
                ${mapaBase64 ? `<img src="${mapaBase64}" style="width: 100%; height: 100%; object-fit: contain; background: #0f172a;" />` : `<div style="padding-top: 80px; text-align:center; color: #64748b; font-size: 12px;">Mapa no disponible</div>`}
            </div>

            <!-- ENCABEZADO DE FICHA TÉCNICA Y ENLACE GEOGRÁFICO CONDICIONAL -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h2 style="font-size: 13px; color: #040d3d; border-left: 4px solid #5a9cf2; padding-left: 8px; text-transform: uppercase; margin: 0;">Ficha del Elemento Seleccionado</h2>
                ${enlaceGeoHtml}
            </div>

            ${tablaFichaHtml}

            <!-- Notas del Cierre Documental -->
            <div style="padding: 12px; background-color: #f8fafc; border-radius: 6px; border-left: 4px solid #cbd5e1; font-size: 10px; color: #64748b; line-height: 1.4;">
                <strong>Nota:</strong> Este documento incluye referencias de geoposicionamiento destinadas a trabajos en territorio. Generado el: ${new Date().toLocaleString('es-AR')}.
            </div>
        `;

        document.body.appendChild(printContainer);

        // 4. Renderizar el contenedor 
        html2canvas(printContainer, {
            scale: 2, 
            useCORS: true,
            logging: false
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Reporte_Activos_Urbanos_${haySeleccion ? infoId.replace(/\s+/g, '_') : 'General'}.pdf`);
            
            document.body.removeChild(printContainer);
        }).catch(err => {
            console.error("Error al procesar la exportación del PDF:", err);
            document.body.removeChild(printContainer);
        });
    });
});


// =========================================================================
// 10. PANEL LATERAL DE ESTADÍSTICAS (Scroll)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const btnStats = document.getElementById('btn-stats');
    const btnCloseStats = document.getElementById('btn-close-stats');
    const statsPanel = document.getElementById('stats-panel');
    const statsContent = document.getElementById('stats-content');

    if (!btnStats || !statsPanel) {
        return;
    }

    const chartInstances = {};

    function destroyCharts() {
        Object.keys(chartInstances).forEach(key => {
            if (chartInstances[key]) {
                chartInstances[key].destroy();
                delete chartInstances[key];
            }
        });
    }

    function renderizarEstadisticas() {
        if (!statsContent) return;

        destroyCharts();

        // --- FORMATO ---
        const filaLimpia = (label, val, badgeColor = 'bg-blue-600') => `
            <div class="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/80 last:border-0">
                <span class="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[170px]" title="${label}">
                    <span class="w-2 h-2 rounded-full shrink-0 ${badgeColor.startsWith('#') ? '' : badgeColor}" style="${badgeColor.startsWith('#') ? `background-color: ${badgeColor};` : ''}"></span> 
                    ${label}
                </span>
                <span class="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">${val}</span>
            </div>`;

        const seccionCard = (titulo, contenido) => `
            <div class="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">${titulo}</h3>
                ${contenido}
            </div>`;

        const formatKW = (val) => val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kW';

        // Totales generales de capas
        const totalLum = capasData.luminarias?.features?.length || 0;

        let totalKm = 0;
        (capasData.vialidades?.features || []).forEach(f => {
            totalKm += parseFloat(f.properties?.km || f.properties?.KM || 0);
        });

        const maxVal = Math.max(totalLum, totalKm) || 1;

        const barra = (label, valor, colorClass = 'bg-indigo-600') => {
            const pct = (valor / maxVal) * 100;
            return `
                <div class="space-y-1.5 mb-2.5">
                    <div class="flex justify-between items-center text-xs">
                        <span class="font-medium text-slate-700 dark:text-slate-300">${label}</span>
                        <span class="font-mono font-semibold text-slate-900 dark:text-slate-100">${typeof valor === 'number' ? valor.toLocaleString() : valor}</span>
                    </div>
                    <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-md h-2 overflow-hidden">
                        <div class="${colorClass} h-2 rounded-md transition-all duration-500 ease-out" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        };

        // --- LUMINARIAS: conteos y potencias ---
        let led = 0, otrasLum = 0;
        let wattsLed = 0, wattsOtras = 0, wattsTotal = 0;
        
        const soporteCounts = { BRAZO:0, COLGANTE:0, HORMIGON:0, MADERA:0, METALICO:0, PARED:0, TORRE:0 };
        const funcionCounts = { CALLE:0, 'ESP VERDE':0, 'ESPACIO PUBLICO':0, VEREDA:0 };
        const zonaCounts = { RURAL:0, URBANO:0, 'SIN DATO':0 };
        const elementoCounts = { COLGANTE:0, FALTANTE:0, FAROLA:0, PEPITA:0, PERITA:0, PROYECTOR:0, REFLECTOR:0, TULIPA:0, VEREDA:0, VIAL:0 };

        (capasData.luminarias?.features || []).forEach(f => {
            const p = f.properties || {};
            
            // Tecnología + Potencia
            const tipo = String(p.sap ?? p.SAP ?? p.tipo ?? p.TIPO ?? p.tecnologia ?? p.tipologia ?? "").trim().toUpperCase();
            const pot = parseFloat(p.potencia ?? p.POTENCIA ?? 0) || 0;

            if (tipo.includes("LED")) {
                led++;
                wattsLed += pot;
            } else {
                otrasLum++;
                wattsOtras += pot;
            }
            wattsTotal += pot;

            // Soporte
            const sop = String(p.soporte ?? p.SOPORTE ?? "").trim().toUpperCase();
            if (soporteCounts.hasOwnProperty(sop)) soporteCounts[sop]++;
            
            // Función
            const func = String(p.funcion ?? p.FUNCION ?? "").trim().toUpperCase();
            if (func === 'CALLE') funcionCounts.CALLE++;
            else if (func === 'ESP VERDE') funcionCounts['ESP VERDE']++;
            else if (func === 'ESPACIO PUBLICO') funcionCounts['ESPACIO PUBLICO']++;
            else if (func === 'VEREDA') funcionCounts.VEREDA++;
            
            // Zona
            const zon = String(p.zona ?? p.ZONA ?? "").trim().toUpperCase();
            if (zon === 'RURAL') zonaCounts.RURAL++;
            else if (zon === 'URBANO') zonaCounts.URBANO++;
            else zonaCounts['SIN DATO']++;
            
            // Elemento
            const elem = String(p.elemento ?? p.ELEMENTO ?? "").trim().toUpperCase();
            if (elementoCounts.hasOwnProperty(elem)) elementoCounts[elem]++;
        });

        // Orden de mayor a menor
        const soportesOrdenados = Object.entries(soporteCounts).sort((a, b) => b[1] - a[1]);
        const funcionesOrdenadas = Object.entries(funcionCounts).sort((a, b) => b[1] - a[1]);
        const elementosOrdenados = Object.entries(elementoCounts).sort((a, b) => b[1] - a[1]);

        // Paleta en gama de azules para elementos
        const gamaAzules = [
            '#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', 
            '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', 
            '#dbeafe', '#eff6ff'
        ];

        // Conversión a Kilowatts (kW)
        const kwTotal = wattsTotal / 1000;
        const kwLed = wattsLed / 1000;
        const kwOtras = wattsOtras / 1000;

        // SCROLL VERTICAL Y EL ESPACIADO 
        statsContent.className = "space-y-4 p-2 overflow-y-auto max-h-[calc(100vh-80px)] pr-2";
        
        statsContent.innerHTML = `
            ${seccionCard('Resumen General', `
                ${barra('Luminarias', totalLum, 'bg-blue-600')}
                ${barra('Vialidades (km)', parseFloat(totalKm.toFixed(1)), 'bg-indigo-600')}
            `)}

            ${seccionCard('Luminarias por Tecnología', `
                <div class="relative h-48 w-full">
                    <canvas id="chart-tecnologia"></canvas>
                </div>
            `)}

            ${seccionCard('Potencia Instalada Total', `
                <div class="space-y-2">
                    <p class="text-[10px] text-slate-200 dark:text-slate-200 leading-tight border-b border-slate-100 dark:border-slate-800 pb-1.5">
                        Suma de potencias individuales (W), a KW. 
                        <span class="block font-mono mt-0.5 font-semibold text-slate-600 dark:text-slate-300">F: kW = Σ(Potencia W) / 1000</span>
                    </p>
                    ${filaLimpia('Total General', formatKW(kwTotal), 'bg-indigo-600')}
                    ${filaLimpia('LED', formatKW(kwLed), 'bg-blue-500')}
                    ${filaLimpia('Otras', formatKW(kwOtras), 'bg-slate-400')}
                </div>
            `)}

            ${seccionCard('Luminarias por Soporte', `
                <div class="space-y-0.5">
                    ${soportesOrdenados.map(([label, val]) => 
                        filaLimpia(label.charAt(0) + label.slice(1).toLowerCase(), val.toLocaleString(), 'bg-blue-600')
                    ).join('')}
                </div>
            `)}

            ${seccionCard('Luminarias por Función', `
                <div class="space-y-0.5">
                    ${funcionesOrdenadas.map(([label, val]) => 
                        filaLimpia(label, val.toLocaleString(), 'bg-indigo-600')
                    ).join('')}
                </div>
            `)}

            ${seccionCard('Luminarias por Zona', `
                <div class="relative h-48 w-full">
                    <canvas id="chart-zona"></canvas>
                </div>
            `)}

            ${seccionCard('Luminarias por Elemento', `
                <div class="space-y-0.5">
                    ${elementosOrdenados.map(([label, val], idx) => {
                        const colorHex = gamaAzules[idx % gamaAzules.length];
                        return filaLimpia(label.charAt(0) + label.slice(1).toLowerCase(), val.toLocaleString(), colorHex);
                    }).join('')}
                </div>
            `)}
        `;

        // --- CONFIGURACIÓN DE GRÁFICOS DE TORTA ---
        const isDark = document.documentElement.classList.contains('dark');
        const labelColor = isDark ? '#e2e8f0' : '#334155';

        // Chart Tecnología
        const ctxTec = document.getElementById('chart-tecnologia')?.getContext('2d');
        if (ctxTec) {
            chartInstances.tecnologia = new Chart(ctxTec, {
                type: 'pie',
                data: {
                    labels: [
                        `LED (${led.toLocaleString()} - ${totalLum ? ((led/totalLum)*100).toFixed(1) : 0}%)`,
                        `Otras (${otrasLum.toLocaleString()} - ${totalLum ? ((otrasLum/totalLum)*100).toFixed(1) : 0}%)`
                    ],
                    datasets: [{
                        data: [led, otrasLum],
                        backgroundColor: ['#3b82f6', '#94a3b8'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: labelColor,
                                font: { size: 11, weight: '500' },
                                boxWidth: 0,
                                padding: 12
                            }
                        }
                    }
                }
            });
        }

        // Chart Zona
        const ctxZona = document.getElementById('chart-zona')?.getContext('2d');
        if (ctxZona) {
            chartInstances.zona = new Chart(ctxZona, {
                type: 'pie',
                data: {
                    labels: [
                        `Urbano (${zonaCounts.URBANO.toLocaleString()})`,
                        `Rural (${zonaCounts.RURAL.toLocaleString()})`,
                        `Sin dato (${zonaCounts['SIN DATO'].toLocaleString()})`
                    ],
                    datasets: [{
                        data: [zonaCounts.URBANO, zonaCounts.RURAL, zonaCounts['SIN DATO']],
                        backgroundColor: ['#2563eb', '#10b981', '#94a3b8'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: labelColor,
                                font: { size: 11, weight: '500' },
                                boxWidth: 0,
                                padding: 10
                            }
                        }
                    }
                }
            });
        }
    }

    btnStats.addEventListener('click', () => {
        renderizarEstadisticas();
        statsPanel.classList.remove('translate-x-full');
    });

    btnCloseStats.addEventListener('click', () => {
        statsPanel.classList.add('translate-x-full');
        destroyCharts();
    });
});