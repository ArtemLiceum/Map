// пример загрузки плана и точек
fetch('/api/plans/1/')
  .then(resp => resp.json())
  .then(plan => {
    const img = document.getElementById('evac-plan');
    img.src = plan.image;
    plan.points.forEach(pt => {
      const dot = document.createElement('div');
      dot.className = 'point';
      dot.style.left = pt.x + '%';
      dot.style.top = pt.y + '%';
      dot.addEventListener('click', () => loadPanorama(pt.id));
      document.getElementById('map-container').append(dot);
    });
  });

function loadPanorama(pointId) {
  fetch(`/api/points/${pointId}/`)
    .then(r => r.json())
    .then(pt => {
      // инициализируете Pannellum или свой простой viewer
      pannellum.viewer('panorama-viewer', {
        type: 'equirectangular',
        panorama: pt.panorama.image,
        hotSpots: pt.panorama.markers.map(m => ({
          pitch: m.pitch,
          yaw: m.azimuth,
          cssClass: 'marker',
          createTooltipFunc: hotspot => hotspot.addEventListener('click', () => loadPanorama(m.target_point))
        }))
      });
    });
}
