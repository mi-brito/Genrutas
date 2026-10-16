import React, { useEffect, useRef } from 'react';
import { CapaMapaCU, Node, Route } from '../types';
import { PowerIcon } from './icons';
import ReactDOMServer from 'react-dom/server';


declare global {
  interface Window {
    L: any;
  }
}

interface InteractiveMapProps {
  nodes: Node[];
  routes: Route[];
  onAddNode?: (lat: number, lng: number) => void;
  highlightedRouteId?: number | null;
  capaCU?: CapaMapaCU | null;
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({ nodes, routes, onAddNode, highlightedRouteId, capaCU }) => {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routesRef = useRef<any[]>([]);
  const capaCURef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current) {
      const L = window.L;
      mapRef.current = L.map('map').setView([19.3248, -99.1792], 14); // Default to C.U., CDMX
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapRef.current);
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clickHandler = (e: any) => {
        if (onAddNode) {
            onAddNode(e.latlng.lat, e.latlng.lng);
        }
    };

    map.on('click', clickHandler);
    
    const mapContainer = map.getContainer();
    if (onAddNode) {
      mapContainer.style.cursor = 'crosshair';
    } else {
      mapContainer.style.cursor = ''; 
    }

    return () => {
      map.off('click', clickHandler);
    };
  }, [onAddNode]);


  useEffect(() => {
    const L = window.L;
    if (!mapRef.current || !L) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (routes.length === 0) {
      nodes.forEach(node => {
        let color = '#22C55E'; // Default for container
        let popupTitle = `Punto de concentración ${node.id}`;
        let pinHtml;

        if (node.type === 'depot') {
          color = '#1E293B';
          popupTitle = `Base ${node.id}`;
        } else if (node.type === 'charging_station') {
          color = '#38BDF8';
          popupTitle = `Estación de Carga ${node.id}`;
        }
        
        if (node.type === 'charging_station') {
           const iconString = ReactDOMServer.renderToString(<PowerIcon style={{ color: 'white' }} />);
           pinHtml = `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 3px rgba(0,0,0,0.4);">${iconString}</div>`;
        } else {
           pinHtml = `
            <svg viewBox="0 0 24 24" fill="${color}" width="32px" height="32px" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          `;
        }

        const icon = L.divIcon({
            className: '',
            html: pinHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
        
        const popupContent = `<b>${popupTitle}</b>` + (node.type === 'container' ? `<br>Demanda: ${node.demand} personas` : '');
        const marker = L.marker([node.lat, node.lng], { icon })
          .addTo(mapRef.current)
          .bindPopup(popupContent);
        markersRef.current.push(marker);
      });
    } else {
      const containerSequenceInfo = new Map<number, { seq: number, color: string }>();
      routes.forEach(route => {
        route.nodos.slice(1, -1).forEach((nodeId, index) => {
            const node = nodes.find(n => n.id === nodeId);
            if (node && node.type === 'container') {
                 containerSequenceInfo.set(nodeId, {
                    seq: index + 1,
                    color: route.color,
                });
            }
        });
      });

      nodes.forEach(node => {
        let icon;
        let popupTitle = '';
        if (node.type === 'depot') {
          popupTitle = 'Base';
          icon = L.divIcon({
            className: 'custom-depot-icon',
            html: `<div style="background-color: #1F2937; color: white; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border-radius: 4px; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);">B</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
        } else if (node.type === 'charging_station') {
            popupTitle = 'Estación de Carga';
            const iconString = ReactDOMServer.renderToString(<PowerIcon style={{ color: '#38BDF8' }} />);
            icon = L.divIcon({
                className: 'custom-charging-icon',
                html: `<div style="background-color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #38BDF8; box-shadow: 0 0 5px rgba(0,0,0,0.5);">${iconString}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });
        } else { // Container
          popupTitle = 'Punto de concentración';
          const info = containerSequenceInfo.get(node.id);
          const fallbackColor = '#6B7280';
          const iconHtml = `
            <div style="background-color: white; color: ${info ? info.color : fallbackColor}; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 50%; border: 3px solid ${info ? info.color : fallbackColor}; box-shadow: 0 0 5px rgba(0,0,0,0.5);">
                ${info ? info.seq : '?'}
            </div>`;
          icon = L.divIcon({
            className: 'custom-customer-icon',
            html: iconHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
        }
        
        const popupContent = `<b>${popupTitle} ${node.id}</b>` + (node.type === 'container' ? `<br>Demanda: ${node.demand} personas` : '');
        const marker = L.marker([node.lat, node.lng], { icon })
          .addTo(mapRef.current)
          .bindPopup(popupContent);
        markersRef.current.push(marker);
      });
    }
    
     if (nodes.length > 0 && routes.length === 0) {
        const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }

  }, [nodes, routes]);

  useEffect(() => {
    const L = window.L;
    if (!mapRef.current || !L) return;

    routesRef.current.forEach(layer => layer.remove());
    routesRef.current = [];

    if (routes.length === 0) {
      return;
    }

    routes.forEach(route => {
      if (route.path && route.path.length > 1) {
        const isHighlighted = route.vehiculoId === highlightedRouteId;
        const polyline = L.polyline(route.path, {
          color: route.color,
          weight: isHighlighted ? 8 : 5,
          opacity: isHighlighted ? 1.0 : 0.7,
        }).addTo(mapRef.current);

        const decorator = L.polylineDecorator(polyline, {
            patterns: [
                {
                    offset: '10%',
                    repeat: 100,
                    symbol: L.Symbol.arrowHead({
                        pixelSize: 12,
                        pathOptions: { fillOpacity: 0.9, weight: 0, color: route.color }
                    })
                }
            ]
        }).addTo(mapRef.current);
        
        polyline.bindPopup(`<b>Unidad ${route.vehiculoId}</b>`);
        routesRef.current.push(polyline);
        routesRef.current.push(decorator);
      }
    });

    if (routesRef.current.length > 0) {
        const allPoints = nodes.map(n => L.latLng(n.lat, n.lng));
        const bounds = L.latLngBounds(allPoints);
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
    
  }, [routes, nodes, highlightedRouteId]);


  // Escenario real de CU: rutas actuales (punteadas), rutas nuevas (con flechas) y paraderos.
  useEffect(() => {
    const L = window.L;
    if (!mapRef.current || !L) return;
    capaCURef.current.forEach(layer => layer.remove());
    capaCURef.current = [];
    if (!capaCU) return;
    const mapa = mapRef.current;
    const puntos: [number, number][] = [];

    capaCU.rutasActuales.forEach(r => {
      if (r.trazo.length < 2) return;
      const linea = L.polyline(r.trazo, { color: r.color, weight: 3, opacity: 0.55, dashArray: '6 6' })
        .addTo(mapa).bindPopup(r.etiqueta);
      capaCURef.current.push(linea);
      puntos.push(...r.trazo);
    });

    capaCU.rutasNuevas.forEach(r => {
      if (r.trazo.length < 2) return;
      const linea = L.polyline(r.trazo, { color: r.color, weight: 6, opacity: 0.9 }).addTo(mapa).bindPopup(r.etiqueta);
      capaCURef.current.push(linea);
      if (L.polylineDecorator) {
        const flechas = L.polylineDecorator(linea, {
          patterns: [{ offset: '10%', repeat: 90, symbol: L.Symbol.arrowHead({ pixelSize: 11, pathOptions: { fillOpacity: 0.9, weight: 0, color: r.color } }) }],
        }).addTo(mapa);
        capaCURef.current.push(flechas);
      }
      puntos.push(...r.trazo);
    });

    const maximo = Math.max(1, ...capaCU.paraderos.map(p => p.valor));
    capaCU.paraderos.forEach(p => {
      const radio = 4 + 14 * Math.sqrt(p.valor / maximo);
      const circulo = L.circleMarker([p.lat, p.lng], { radius: radio, color: '#0f766e', weight: 1.5, fillColor: '#14b8a6', fillOpacity: 0.55 })
        .addTo(mapa).bindPopup(`<b>${p.nombre}</b><br>${p.etiqueta}`);
      capaCURef.current.push(circulo);
      puntos.push([p.lat, p.lng]);
    });

    if (capaCU.base) {
      const icono = L.divIcon({
        className: '',
        html: `<div style="background:#1F2937;color:white;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:bold;border-radius:4px;border:2px solid white;box-shadow:0 0 5px rgba(0,0,0,.5)">⚡</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      const marcador = L.marker([capaCU.base.lat, capaCU.base.lng], { icon: icono }).addTo(mapa)
        .bindPopup(`<b>Base ${capaCU.base.nombre}</b><br>Cargador de 150 kW`);
      capaCURef.current.push(marcador);
      puntos.push([capaCU.base.lat, capaCU.base.lng]);
    }

    if (puntos.length > 1) mapa.fitBounds(L.latLngBounds(puntos), { padding: [30, 30] });
  }, [capaCU]);

  return <div id="map" style={{ height: '100%', width: '100%' }}></div>;
};

export default InteractiveMap;