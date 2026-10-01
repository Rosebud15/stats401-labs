(() => {
  'use strict';
  const W = 960;
  const H = 520;
  const fmtTrillion = value => `$${(value / 1000).toFixed(value < 1000 ? 2 : 1)}T`;
  if (typeof window.d3 === 'undefined') {
    const errorElement = document.getElementById('lab9-error');
    errorElement.hidden = false;
    errorElement.textContent = 'D3 did not load. Check your internet connection (the D3 library is loaded from jsDelivr).';
    return;
  }
  const fmtBillion = value => `$${d3.format(',.1f')(value)} billion`;
  const safe = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tip = d3.select('#lab9-tooltip');
  const status = d3.select('#lab9-selection-status');
  const countrySelect = d3.select('#lab9-country-select');
  const error = d3.select('#lab9-error');


  Promise.all([
    d3.json('../data/world_lab9.geojson'),
    d3.csv('../data/lab9_gdp_2025_top50.csv', row => ({
      iso3: row.iso3.trim(),
      country: row.country.trim(),
      gdp: Number(row.gdp_2025_billion_usd),
      rank: Number(row.rank)
    }))
  ]).then(([geo, rows]) => initialize(geo, rows)).catch(err => {
    console.error('Lab 9 failed to load:', err);
    error.attr('hidden', null).text('The Lab 9 data did not load. Serve the entire stats401-labs folder through a local HTTP server or GitHub Pages. Details: ' + err.message);
  });

  function initialize(geo, rows) {
    const validRows = rows.filter(row => row.iso3 && Number.isFinite(row.gdp) && row.gdp > 0);
    const rowByIso = new Map(validRows.map(row => [row.iso3, row]));
    const allFeatures = geo.features;
    const polygons = allFeatures.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
    const smallPlaces = allFeatures.filter(f => f.geometry?.type === 'Point');
    // The preprocessing script remaps FRA/NOR and adds HKG/SGP point markers.
    const matchedIso = new Set(allFeatures.filter(f => rowByIso.has(f.properties.iso3)).map(f => f.properties.iso3));
    const unmatched = validRows.filter(row => !matchedIso.has(row.iso3));
    if (unmatched.length) {
      throw new Error('Missing geographic match for: ' + unmatched.map(d => d.iso3).join(', '));
    }
    if (matchedIso.size !== 50) console.warn(`Expected 50 joined ISO-3 identifiers; found ${matchedIso.size}`);
    // Attach the statistical record to each feature; absent rows remain undefined, never zero.
    allFeatures.forEach(f => { f.properties.gdpRecord = rowByIso.get(f.properties.iso3); });

    const projection = d3.geoNaturalEarth1().fitExtent([[17, 16], [W - 17, H - 16]], {
      type: 'FeatureCollection', features: polygons
    });
    const path = d3.geoPath(projection);
    const extent = d3.extent(validRows, d => d.gdp);
    // Logarithmic shading makes the differences within the bottom of the top 50 legible.
    const color = d3.scaleLog().domain(extent).range([0.18, 0.94]);
    const colorFor = value => d3.interpolateBlues(color(value));
    // d3.scaleSqrt makes πr² (rather than r) proportional to GDP.
    const radius = d3.scaleSqrt().domain([0, d3.max(validRows, d => d.gdp)]).range([0, 53]);

    const graticule = d3.geoGraticule10();
    const choroSvg = d3.select('#lab9-choropleth');
    const cartSvg = d3.select('#lab9-cartogram');
    choroSvg.append('title').text('2025 nominal GDP choropleth of the world');
    cartSvg.append('title').text('2025 nominal GDP proportional-circle Dorling cartogram');
    choroSvg.append('rect').attr('width', W).attr('height', H).attr('fill', '#fbfdff');
    cartSvg.append('rect').attr('width', W).attr('height', H).attr('fill', '#fbfdff');
    const mapGroup = choroSvg.append('g').attr('class', 'lab9-geo-layer');
    mapGroup.append('path').datum(graticule).attr('class', 'lab9-graticule').attr('d', path);
    const cartGroup = cartSvg.append('g').attr('class', 'lab9-circle-layer');
    cartGroup.append('path').datum(graticule).attr('class', 'lab9-graticule').attr('d', path);

    let selectedIso = null;
    let hoveredIso = null;
    const zoomChoro = d3.zoom().scaleExtent([1, 6])
      .translateExtent([[0, 0], [W, H]]).extent([[0, 0], [W, H]])
      .on('zoom', e => mapGroup.attr('transform', e.transform));
    const zoomCart = d3.zoom().scaleExtent([1, 6])
      .translateExtent([[0, 0], [W, H]]).extent([[0, 0], [W, H]])
      .on('zoom', e => cartGroup.attr('transform', e.transform));
    choroSvg.call(zoomChoro).on('dblclick.zoom', null);
    cartSvg.call(zoomCart).on('dblclick.zoom', null);

    const geoCountries = mapGroup.selectAll('path.lab9-country')
      .data(polygons, d => d.properties.iso3)
      .join('path')
      .attr('class', 'lab9-country')
      .attr('d', path)
      .attr('fill', f => f.properties.gdpRecord ? colorFor(f.properties.gdpRecord.gdp) : '#e4ebf0');
    const pointMarkers = mapGroup.selectAll('circle.lab9-marker')
      .data(smallPlaces, f => f.properties.iso3)
      .join('circle')
      .attr('class', 'lab9-marker')
      .attr('cx', f => projection(f.geometry.coordinates)[0])
      .attr('cy', f => projection(f.geometry.coordinates)[1])
      .attr('r', 5.7)
      .style('fill', f => f.properties.gdpRecord ? colorFor(f.properties.gdpRecord.gdp) : '#e4ebf0');

    // A Dorling cartogram retains geographic *proximity*, not real shape or exact position.
    // For countries with disconnected landmasses, use a recognizable continental anchor.
    const anchors = new Map([
      ['USA',[-98,39]],['CAN',[-107,57]],['RUS',[90,59]],['FRA',[2,47]],
      ['NOR',[9,62]],['CHN',[104,35]],['AUS',[135,-25]],['IDN',[118,-3]],
      ['JPN',[138,37]],['GBR',[-2,54]],['NZL',[172,-41]],['HKG',[114.1694,22.3193]],
      ['SGP',[103.8198,1.3521]],['TWN',[121,24]],['KOR',[127.5,36]]
    ]);
    const featureByIso = new Map(allFeatures.map(f => [f.properties.iso3, f]));
    const nodes = validRows.map(row => {
      const f = featureByIso.get(row.iso3);
      const anchor = anchors.has(row.iso3)
        ? projection(anchors.get(row.iso3))
        : f.geometry.type === 'Point'
          ? projection(f.geometry.coordinates)
          : path.centroid(f);
      if (!anchor || !anchor.every(Number.isFinite)) throw new Error('Invalid cartogram position: ' + row.iso3);
      return {
        ...row,
        anchorX: anchor[0], anchorY: anchor[1],
        x: anchor[0], y: anchor[1], r: radius(row.gdp)
      };
    });
    d3.forceSimulation(nodes)
      .force('x', d3.forceX(d => d.anchorX).strength(0.18))
      .force('y', d3.forceY(d => d.anchorY).strength(0.18))
      .force('collide', d3.forceCollide(d => d.r + 2.0).iterations(5))
      .stop()
      .tick(550);

    const cartCountries = cartGroup.selectAll('circle.lab9-cart-circle')
      .data(nodes, d => d.iso3)
      .join('circle')
      .attr('class', 'lab9-cart-circle')
      .attr('cx', d => d.x).attr('cy', d => d.y).attr('r', d => d.r);
    // Label only large circles; all 50 remain searchable / available in tooltips.
    const cartLabels = cartGroup.selectAll('text.lab9-cart-label')
      .data(nodes.filter(d => d.r >= 19), d => d.iso3)
      .join('text')
      .attr('class', 'lab9-cart-label')
      .attr('x', d => d.x).attr('y', d => d.y).text(d => d.iso3);

    const defaultStatus = 'Hover over either map to highlight linked economies; click to keep one selected.';
    function focusedIso() { return hoveredIso || selectedIso; }
    function updateFocus() {
      const focus = focusedIso();
      geoCountries
        .classed('is-muted', d => Boolean(focus) && d.properties.iso3 !== focus)
        .classed('is-active', d => d.properties.iso3 === focus)
        .attr('fill', f => f.properties.gdpRecord ? colorFor(f.properties.gdpRecord.gdp) : '#e4ebf0');
      pointMarkers
        .classed('is-muted', d => Boolean(focus) && d.properties.iso3 !== focus)
        .classed('is-active', d => d.properties.iso3 === focus)
        .style('fill', d => d.properties.iso3 === focus ? '#edab4f' : colorFor(d.properties.gdpRecord.gdp));
      cartCountries
        .classed('is-muted', d => Boolean(focus) && d.iso3 !== focus)
        .classed('is-active', d => d.iso3 === focus);
      cartLabels.style('opacity', d => (!focus || d.iso3 === focus) ? 1 : .28);
      if (focus) {
        geoCountries.filter(d => d.properties.iso3 === focus).raise();
        pointMarkers.raise(); // Small-city markers stay accessible over nearby country paths.
        cartCountries.filter(d => d.iso3 === focus).raise();
        cartLabels.raise();
      }
      const activeRow = rowByIso.get(focus);
      status.text(activeRow
        ? `${activeRow.country} · Rank ${activeRow.rank} · ${fmtBillion(activeRow.gdp)}${selectedIso === focus ? ' · Pinned' : ''}`
        : defaultStatus);
    }
    function showTip(event, row, name, isPoint) {
      tip.html(row
        ? `<strong>${safe(row.country)}</strong><br>2025 GDP: ${safe(fmtBillion(row.gdp))}<br>Rank: ${row.rank} of 50${isPoint ? '<span class="lab9-tip-note">Location marker (no separate boundary)</span>' : ''}`
        : `<strong>${safe(name)}</strong><span class="lab9-tip-note">Outside the provided top-50 dataset; GDP not shown.</span>`);
      tip.attr('hidden', null);
      positionTip(event);
    }
    function positionTip(e) {
      const elem = tip.node();
      const maxX = Math.max(10, window.innerWidth - elem.offsetWidth - 12);
      const maxY = Math.max(10, window.innerHeight - elem.offsetHeight - 12);
      tip.style('left', Math.max(10, Math.min(e.clientX + 15, maxX)) + 'px')
        .style('top', Math.max(10, Math.min(e.clientY + 16, maxY)) + 'px');
    }
    function selectCountry(iso) {
      selectedIso = iso || null;
      hoveredIso = null;
      countrySelect.property('value', selectedIso || '');
      updateFocus();
    }
    function attachEvents(selection, isoFn, rowFn, nameFn, pointFn) {
      selection
        .on('mouseenter', (event, item) => {
          const row = rowFn(item);
          hoveredIso = row ? isoFn(item) : null;
          updateFocus();
          showTip(event, row, nameFn(item), pointFn(item));
        })
        .on('mousemove', event => positionTip(event))
        .on('mouseleave', () => { hoveredIso = null; tip.attr('hidden', true); updateFocus(); })
        .on('click', (event, item) => {
          event.stopPropagation();
          const row = rowFn(item);
          if (row) {
            selectedIso = row.iso3;
            countrySelect.property('value', selectedIso);
            updateFocus();
          }
        })
        .on('keydown', (event, item) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const row = rowFn(item);
            if (row) selectCountry(row.iso3);
          }
        })
        .attr('tabindex', item => rowFn(item) ? 0 : -1)
        .attr('aria-label', item => {
          const row = rowFn(item);
          return row ? `${row.country}: ${fmtBillion(row.gdp)}, rank ${row.rank}` : `${nameFn(item)}: not in the supplied dataset`;
        });
    }
    attachEvents(geoCountries, f => f.properties.iso3, f => f.properties.gdpRecord, f => f.properties.name, () => false);
    attachEvents(pointMarkers, f => f.properties.iso3, f => f.properties.gdpRecord, f => f.properties.name, () => true);
    attachEvents(cartCountries, d => d.iso3, d => d, d => d.country, () => false);

    countrySelect.selectAll('option.lab9-economy')
      .data(validRows.slice().sort((a,b) => a.country.localeCompare(b.country)))
      .join('option').attr('class','lab9-economy')
      .attr('value', d => d.iso3).text(d => `${d.country} (#${d.rank})`);
    countrySelect.on('change', event => selectCountry(event.target.value));
    d3.select('#lab9-reset').on('click', () => {
      selectCountry(null);
      tip.attr('hidden', true);
      choroSvg.transition().duration(400).call(zoomChoro.transform, d3.zoomIdentity);
      cartSvg.transition().duration(400).call(zoomCart.transform, d3.zoomIdentity);
    });
    choroSvg.on('click.selection', event => {
      if (event.target === choroSvg || event.target.tagName.toLowerCase() === 'rect') selectCountry(null);
    });
    cartSvg.on('click.selection', event => {
      if (event.target === cartSvg || event.target.tagName.toLowerCase() === 'rect') selectCountry(null);
    });

    makeColorLegend(colorFor, extent);
    makeAreaLegend(radius);
    updateFocus();
    console.info(`Lab 9 loaded: ${matchedIso.size}/50 ISO-3 GDP rows matched; ${polygons.length} country polygons and ${smallPlaces.length} city-sized point markers.`);
  }

  function makeColorLegend(colorFor, extent) {
    const svg = d3.select('#lab9-color-legend');
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient').attr('id','lab9-color-gradient');
    const [minGDP,maxGDP] = extent;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const value = Math.exp(Math.log(minGDP) + t * (Math.log(maxGDP) - Math.log(minGDP)));
      gradient.append('stop').attr('offset',`${t*100}%`).attr('stop-color',colorFor(value));
    }
    const x = d3.scaleLog().domain(extent).range([22,348]);
    svg.append('rect').attr('x',22).attr('y',12).attr('width',326).attr('height',16)
      .attr('rx',3).attr('fill','url(#lab9-color-gradient)');
    const ticks = [300,1000,3000,10000,30000].filter(v => v >= minGDP * .95 && v <= maxGDP * 1.01);
    svg.append('g').attr('transform','translate(0,29)')
      .call(d3.axisBottom(x).tickValues(ticks).tickSize(6).tickFormat(fmtTrillion))
      .call(g => g.select('.domain').attr('stroke','#a7b6c2'))
      .call(g => g.selectAll('text').attr('fill','#496275').attr('font-size',11));
  }

  function makeAreaLegend(radius) {
    const svg = d3.select('#lab9-size-legend');
    const examples = [{value:1000,x:52},{value:5000,x:168},{value:20000,x:294}];
    const bottom = 91;
    svg.selectAll('circle').data(examples).join('circle')
      .attr('cx',d=>d.x).attr('cy',d=>bottom-radius(d.value)).attr('r',d=>radius(d.value))
      .attr('fill','#d9e9f2').attr('stroke','#2b7eaa').attr('stroke-width',1.6);
    svg.selectAll('text').data(examples).join('text')
      .attr('x',d=>d.x).attr('y',d=>bottom+19).attr('text-anchor','middle')
      .attr('font-size',12).attr('fill','#456173').text(d=>fmtTrillion(d.value));
    svg.append('line').attr('x1',18).attr('x2',349).attr('y1',bottom).attr('y2',bottom)
      .attr('stroke','#aabac7').attr('stroke-dasharray','3,4');
  }
})();
