const HIERARCHY_URL = "data/dnas_research.csv";
const FACULTY_URL = "data/dnas_faculty_details.csv";
const MAJOR_SUPPORT_URL = "data/dnas_major_support.csv";

const areaOrder = [
  "Biological, behavioral sciences and health",
  "Data and computer sciences",
  "Environmental science and sustainability",
  "Math, physical and materials sciences"
];

const areaColors = new Map([
  [areaOrder[0], "#a84848"],
  [areaOrder[1], "#5658a9"],
  [areaOrder[2], "#2f7c63"],
  [areaOrder[3], "#96652f"]
]);

const shortAreaNames = new Map([
  [areaOrder[0], "Biological, behavioral sciences & health"],
  [areaOrder[1], "Data & computer sciences"],
  [areaOrder[2], "Environmental science & sustainability"],
  [areaOrder[3], "Math, physical & materials sciences"]
]);

const state = {
  query: "",
  sortMode: "source",
  crossOnly: false,
  selectedFaculty: null
};

let rows = [];
let facultyDetails = [];
let majorSupports = [];
let facultyMap = new Map();
let detailMap = new Map();
let fullHierarchy = [];

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function splitList(value) {
  return String(value ?? "")
    .split("||")
    .map(d => d.trim())
    .filter(Boolean);
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function buildSearchBlob(row) {
  const d = row.details || {};
  return normalize([
    row.faculty,
    row.area,
    row.subfield,
    d.title,
    d.email,
    d.research_direction,
    d.research_pillar_primary,
    d.research_pillar_secondary,
    d.research_discipline_primary,
    d.research_discipline_secondary,
    d.teaching_parent_major,
    d.teaching_major_primary,
    d.major_support_secondary,
    ...(d.researchInterests || []),
    ...(d.courses || [])
  ].join(" "));
}

function buildModel(hierarchyData, detailData) {
  detailMap = new Map(detailData.map(d => [d.faculty, d]));
  facultyMap = d3.group(hierarchyData, d => d.faculty);

  hierarchyData.forEach((d, index) => {
    d.sourceIndex = index;
    d.details = detailMap.get(d.faculty) || {};
    d.areaCount = new Set(facultyMap.get(d.faculty).map(x => x.area)).size;
    d.crossDisciplinary = d.areaCount > 1;
    d.searchBlob = buildSearchBlob(d);
  });

  const groupedAreas = d3.group(hierarchyData, d => d.area, d => d.subfield);

  fullHierarchy = areaOrder.map(area => {
    const topicMap = groupedAreas.get(area) ?? new Map();
    const topics = Array.from(topicMap, ([name, facultyRows], sourceOrder) => ({
      name,
      sourceOrder,
      faculty: facultyRows.map(d => ({ ...d }))
    }));

    return {
      name: area,
      color: areaColors.get(area),
      topics,
      memberships: d3.sum(topics, t => t.faculty.length),
      topicCount: topics.length,
      uniqueFaculty: new Set(topics.flatMap(t => t.faculty.map(f => f.faculty))).size
    };
  });
}

function renderMetrics() {
  const uniqueFaculty = new Set(rows.map(d => d.faculty)).size;
  const areaTopicGroups = new Set(rows.map(d => `${d.area}||${d.subfield}`)).size;
  const crossAreaFaculty = new Set(rows.filter(d => d.crossDisciplinary).map(d => d.faculty)).size;
  const interestAssignments = d3.sum(facultyDetails, d => d.researchInterestCount);
  const courseListings = d3.sum(facultyDetails, d => d.courseCount);

  const metrics = [
    { value: uniqueFaculty, label: "unique faculty" },
    { value: areaTopicGroups, label: "area–topic groups" },
    { value: crossAreaFaculty, label: "faculty shown in multiple tree areas" },
    { value: interestAssignments, label: "faculty–interest links" },
    { value: courseListings, label: "faculty–course listings" },
    { value: majorSupports.length, label: "primary teaching-major categories" }
  ];

  const cards = d3.select("#summary-metrics")
    .selectAll("div.metric-card")
    .data(metrics)
    .join("div")
    .attr("class", "metric-card");

  cards.html("");
  cards.append("span").attr("class", "metric-value").text(d => d.value);
  cards.append("span").attr("class", "metric-label").text(d => d.label);
}

function wrapSvgText(selection, width) {
  selection.each(function() {
    const text = d3.select(this);
    const words = text.text().split(/\s+/).reverse();
    const x = +text.attr("x");
    const y = +text.attr("y");
    const dy = parseFloat(text.attr("dy") || 0);
    let line = [];
    let lineNumber = 0;
    const lineHeight = 1.08;
    let tspan = text.text(null).append("tspan").attr("x", x).attr("y", y).attr("dy", `${dy}em`);
    let word;

    while ((word = words.pop())) {
      line.push(word);
      tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = text.append("tspan")
          .attr("x", x)
          .attr("y", y)
          .attr("dy", `${++lineNumber * lineHeight + dy}em`)
          .text(word);
      }
    }
  });
}

function renderOverview() {
  const container = d3.select("#area-overview");
  container.selectAll("*").remove();

  const data = fullHierarchy;
  const width = 960;
  const height = 270;
  const margin = { top: 14, right: 70, bottom: 18, left: 285 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Faculty memberships by top-level research area");

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.memberships)])
    .nice()
    .range([0, innerWidth]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.name))
    .range([0, innerHeight])
    .padding(0.34);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.selectAll("line.guide")
    .data(x.ticks(5))
    .join("line")
    .attr("class", "guide")
    .attr("x1", d => x(d))
    .attr("x2", d => x(d))
    .attr("y1", 0)
    .attr("y2", innerHeight)
    .attr("stroke", "#e7ebf0")
    .attr("stroke-width", 1);

  g.selectAll("rect.bar")
    .data(data)
    .join("rect")
    .attr("class", "bar")
    .attr("x", 0)
    .attr("y", d => y(d.name))
    .attr("width", d => x(d.memberships))
    .attr("height", y.bandwidth())
    .attr("rx", 6)
    .attr("fill", d => d.color);

  g.selectAll("text.value")
    .data(data)
    .join("text")
    .attr("class", "value")
    .attr("x", d => x(d.memberships) + 9)
    .attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
    .attr("font-size", 13)
    .attr("font-weight", 800)
    .attr("fill", "#253149")
    .text(d => d.memberships);

  const labels = svg.append("g")
    .attr("transform", `translate(${margin.left - 14},${margin.top})`)
    .selectAll("text.area-label")
    .data(data)
    .join("text")
    .attr("class", "area-label")
    .attr("text-anchor", "end")
    .attr("x", 0)
    .attr("y", d => y(d.name) + y.bandwidth() / 2 - 3)
    .attr("font-size", 12.5)
    .attr("font-weight", 700)
    .attr("fill", "#273247")
    .text(d => shortAreaNames.get(d.name));

  wrapSvgText(labels, 245);

  svg.append("text")
    .attr("x", width - 16)
    .attr("y", height - 5)
    .attr("text-anchor", "end")
    .attr("font-size", 11.5)
    .attr("fill", "#6d788c")
    .text("Faculty memberships");
}

function getFilteredHierarchy() {
  const q = normalize(state.query);

  return fullHierarchy.map(area => {
    const areaMatches = q && normalize(area.name).includes(q);

    let topics = area.topics.map(topic => {
      const topicMatches = q && normalize(topic.name).includes(q);

      const faculty = topic.faculty.filter(f => {
        const queryPass = !q || areaMatches || topicMatches || f.searchBlob.includes(q);
        const crossPass = !state.crossOnly || f.crossDisciplinary;
        return queryPass && crossPass;
      });

      return { ...topic, faculty };
    }).filter(topic => topic.faculty.length > 0);

    if (state.sortMode === "count") {
      topics = topics.sort((a, b) => d3.descending(a.faculty.length, b.faculty.length) || d3.ascending(a.name, b.name));
    } else if (state.sortMode === "alpha") {
      topics = topics.sort((a, b) => d3.ascending(a.name, b.name));
    } else {
      topics = topics.sort((a, b) => d3.ascending(a.sourceOrder, b.sourceOrder));
    }

    return {
      ...area,
      topics,
      visibleMemberships: d3.sum(topics, t => t.faculty.length),
      visibleUniqueFaculty: new Set(topics.flatMap(t => t.faculty.map(f => f.faculty))).size
    };
  }).filter(area => area.topics.length > 0);
}

function appendTagList(parent, items, className = "detail-tag") {
  const clean = items.filter(Boolean);
  if (!clean.length) return;

  parent.append("div")
    .attr("class", "detail-tags")
    .selectAll(`span.${className}`)
    .data(clean)
    .join("span")
    .attr("class", className)
    .text(d => d);
}

function appendDetailGroup(parent, heading, items, options = {}) {
  const clean = items.filter(Boolean);
  if (!clean.length) return;

  const section = parent.append("section").attr("class", "detail-group");
  section.append("h5").text(heading);

  if (options.tags) {
    appendTagList(section, clean, options.className || "detail-tag");
  } else {
    section.append("ul")
      .selectAll("li")
      .data(clean)
      .join("li")
      .text(d => d);
  }
}

function renderFacultyDetail() {
  const detail = d3.select("#faculty-detail");

  if (!state.selectedFaculty || !facultyMap.has(state.selectedFaculty)) {
    detail.attr("hidden", true).html("");
    return;
  }

  const entries = facultyMap.get(state.selectedFaculty);
  const meta = detailMap.get(state.selectedFaculty) || {};
  const areaCount = new Set(entries.map(d => d.area)).size;
  const profileUrl = meta.faculty_url || entries.find(d => d.url)?.url;

  detail.attr("hidden", null).html("");

  const header = detail.append("div").attr("class", "faculty-detail-header");
  const copy = header.append("div").attr("class", "faculty-detail-title");
  copy.append("h4").text(state.selectedFaculty);
  if (meta.title) copy.append("p").attr("class", "faculty-title").text(meta.title);
  copy.append("p")
    .attr("class", "faculty-summary")
    .text(areaCount > 1
      ? `${areaCount} hierarchy areas — every occurrence is highlighted below.`
      : "One hierarchy area in the public research tree.");

  const actions = header.append("div").attr("class", "faculty-detail-actions");
  if (meta.email) {
    actions.append("a")
      .attr("href", `mailto:${meta.email}`)
      .text(meta.email);
  }
  if (profileUrl) {
    actions.append("a")
      .attr("href", profileUrl)
      .attr("target", "_blank")
      .attr("rel", "noreferrer")
      .text("Faculty profile ↗");
  }

  const columns = detail.append("div").attr("class", "faculty-detail-grid");
  const researchCol = columns.append("div").attr("class", "faculty-detail-column");
  researchCol.append("h5").attr("class", "detail-column-title").text("Research context");

  const researchFacts = [];
  if (meta.research_pillar_primary) researchFacts.push(`Primary pillar: ${meta.research_pillar_primary}`);
  if (meta.research_pillar_secondary) researchFacts.push(`Secondary pillar: ${meta.research_pillar_secondary}`);
  if (meta.research_discipline_primary) researchFacts.push(`Primary discipline: ${meta.research_discipline_primary}`);
  if (meta.research_discipline_secondary) researchFacts.push(`Secondary discipline: ${meta.research_discipline_secondary}`);
  appendDetailGroup(researchCol, "Recorded classifications", researchFacts);
  appendDetailGroup(researchCol, "Research interests", meta.researchInterests || [], { tags: true, className: "interest-tag" });

  const teachingCol = columns.append("div").attr("class", "faculty-detail-column");
  teachingCol.append("h5").attr("class", "detail-column-title").text("Teaching context");

  const teachingFacts = [];
  if (meta.teaching_parent_major) teachingFacts.push(`Major-support family: ${meta.teaching_parent_major}`);
  if (meta.teaching_major_primary) teachingFacts.push(`Primary major support: ${meta.teaching_major_primary}`);
  if (meta.major_support_secondary) teachingFacts.push(`Secondary major support: ${meta.major_support_secondary}`);
  appendDetailGroup(teachingCol, "Major support", teachingFacts);
  appendDetailGroup(teachingCol, "Courses listed", meta.courses || [], { tags: true, className: "course-tag" });

  const membershipCol = columns.append("div").attr("class", "faculty-detail-column membership-column");
  membershipCol.append("h5").attr("class", "detail-column-title").text("Research-tree memberships");
  membershipCol.append("ul")
    .attr("class", "membership-list")
    .selectAll("li")
    .data(entries)
    .join("li")
    .text(d => `${d.area} → ${d.subfield}`);
}

function renderDirectory() {
  const filtered = getFilteredHierarchy();
  const directory = d3.select("#research-directory");
  directory.selectAll("*").remove();

  const visibleRows = filtered.flatMap(a => a.topics.flatMap(t => t.faculty));
  const visibleUniqueFaculty = new Set(visibleRows.map(d => d.faculty)).size;

  d3.select("#results-status").text(
    filtered.length
      ? `${plural(visibleUniqueFaculty, "faculty member")} across ${plural(filtered.length, "visible area")}`
      : "No matching faculty, topics, interests, courses, or major-support fields"
  );

  if (!filtered.length) {
    directory.append("div")
      .attr("class", "empty-state")
      .text("No results match the current search and filters.");
    renderFacultyDetail();
    return;
  }

  const areaCards = directory.selectAll("section.area-card")
    .data(filtered, d => d.name)
    .join("section")
    .attr("class", "area-card")
    .style("--area-color", d => d.color);

  const headers = areaCards.append("header").attr("class", "area-header");
  const headerCopy = headers.append("div");
  headerCopy.append("h4").attr("class", "area-title").text(d => d.name);
  headerCopy.append("p")
    .attr("class", "area-counts")
    .text(d => `${plural(d.visibleMemberships, "membership")} · ${plural(d.topics.length, "topic")}`);
  headers.append("span").attr("class", "area-swatch").attr("aria-hidden", "true");

  areaCards.each(function(area) {
    const card = d3.select(this);
    const maxTopic = d3.max(area.topics, t => t.faculty.length) || 1;

    const topicBlocks = card.append("div")
      .attr("class", "topic-list")
      .selectAll("section.topic-block")
      .data(area.topics, d => d.name)
      .join("section")
      .attr("class", "topic-block");

    const heading = topicBlocks.append("div").attr("class", "topic-heading-row");
    heading.append("h5").attr("class", "topic-name").text(d => d.name);
    heading.append("span").attr("class", "topic-count").text(d => plural(d.faculty.length, "faculty"));

    topicBlocks.append("div")
      .attr("class", "topic-bar-track")
      .append("div")
      .attr("class", "topic-bar")
      .style("width", d => `${Math.max(5, (d.faculty.length / maxTopic) * 100)}%`);

    topicBlocks.each(function(topic) {
      d3.select(this).append("div")
        .attr("class", "faculty-list")
        .selectAll("button.faculty-chip")
        .data(topic.faculty, d => `${d.area}|${d.subfield}|${d.faculty}`)
        .join("button")
        .attr("type", "button")
        .attr("class", d => {
          const classes = ["faculty-chip"];
          if (d.crossDisciplinary) classes.push("cross-disciplinary");
          if (state.selectedFaculty === d.faculty) classes.push("selected");
          if (state.selectedFaculty && state.selectedFaculty !== d.faculty) classes.push("deemphasized");
          return classes.join(" ");
        })
        .attr("aria-label", d => d.crossDisciplinary
          ? `${d.faculty}, appears in more than one top-level area in the public tree`
          : d.faculty)
        .text(d => d.faculty)
        .on("click", (event, d) => {
          state.selectedFaculty = state.selectedFaculty === d.faculty ? null : d.faculty;
          renderDirectory();
        });
    });
  });

  renderFacultyDetail();
}

function clearFilters() {
  state.query = "";
  state.sortMode = "source";
  state.crossOnly = false;
  state.selectedFaculty = null;

  d3.select("#search-input").property("value", "");
  d3.select("#sort-select").property("value", "source");
  d3.select("#cross-only").property("checked", false);
  renderDirectory();
}

function wireControls() {
  d3.select("#search-input").on("input", function() {
    state.query = this.value;
    state.selectedFaculty = null;
    renderDirectory();
  });

  d3.select("#sort-select").on("change", function() {
    state.sortMode = this.value;
    renderDirectory();
  });

  d3.select("#cross-only").on("change", function() {
    state.crossOnly = this.checked;
    state.selectedFaculty = null;
    renderDirectory();
  });

  d3.select("#clear-button").on("click", clearFilters);
}

async function init() {
  try {
    const [hierarchyData, detailData, majorSupportData] = await Promise.all([
      d3.csv(HIERARCHY_URL),
      d3.csv(FACULTY_URL),
      d3.csv(MAJOR_SUPPORT_URL)
    ]);

    facultyDetails = detailData.map(d => ({
      ...d,
      researchInterests: splitList(d.research_interests),
      courses: splitList(d.courses_taught),
      additionalUrls: splitList(d.additional_urls),
      researchInterestCount: +d.research_interest_count || 0,
      courseCount: +d.course_count || 0
    }));
    majorSupports = majorSupportData;
    rows = hierarchyData;

    buildModel(rows, facultyDetails);
    renderMetrics();
    renderOverview();
    wireControls();
    renderDirectory();
  } catch (error) {
    console.error(error);
    d3.select("#load-error").attr("hidden", null);
  }
}

init();
