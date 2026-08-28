// The résumé as real markup rather than a rendered page image, so the text
// in the overlay can be selected, copied and searched. Layout mirrors
// Lorn_Hin_Adrian_Lam_Resume.pdf; keep the two in sync when the PDF changes.

type Entry = {
  title: string;
  when: string;
  org?: string;
  where?: string;
  bullets: string[];
};

const SECTIONS: { heading: string; entries: Entry[] }[] = [
  {
    heading: "Work Experience",
    entries: [
      {
        title: "Data Scientist, Gen AI",
        when: "Jul. 2025 – Present",
        org: "Asurion",
        where: "New York, NY",
        bullets: [
          "Architected agentic voice-AI using <b>Claude Agents</b>, <b>Redis</b>, and <b>hybrid RAG</b> pipeline, serving <b>10K+ annual</b> requests",
          "Created <b>subagent orchestrator</b> with dynamic context injection for <b>multi-turn reasoning</b>, recovering <b>60%</b> of failed chats",
          "Integrated <b>MCP tooling</b> and LLM scorers on <b>Braintrust</b>, automating audit reviews and resolving <b>3x</b> more conversation failures in production",
        ],
      },
      {
        title: "Machine Learning Engineer, Intern",
        when: "Oct. 2024 – Jun. 2025",
        org: "Asurion",
        where: "San Francisco, CA",
        bullets: [
          "Led team of 4 to design <b>GraphRAG</b> pipeline, improving multi-step logical reasoning accuracy by 40% over <b>10,000+ tests</b>",
          "Pioneered <b>AI voice chatbot</b> using <b>AWS LEX and Connect</b>, reducing latency by 4x across customer service deployments",
          "Deployed <b>MLOps</b> benchmarking framework with <b>Docker</b> and <b>CI/CD</b> to analyze <b>multimodal LLM</b> performance to identify optimal deployment configurations for <b>+20k monthly</b> tickets",
        ],
      },
      {
        title: "Data Scientist, Intern",
        when: "Jun. 2023 – Sep. 2023",
        org: "Towngas (The Hong Kong Gas Company Limited)",
        where: "Hong Kong",
        bullets: [
          "Engineered automated <b>ETL</b> pipeline with <b>PySpark</b> to restructure <b>300TB</b> unstructured database and minimize query delay",
          "Constructed e-commerce traffic <b>analytics dashboard</b> to identify and fix 4+ UI bottlenecks for <b>7.2k</b> potential transactions",
          "Trained and optimized <b>XGBoost</b> classifier on historical dispatch data, reducing technician redundancies by 30% and projecting <b>$110K</b> in annual savings",
        ],
      },
    ],
  },
  {
    heading: "Research",
    entries: [
      {
        title: "Machine Learning Engineer, Data Platforms",
        when: "Nov. 2023 – Jul. 2024",
        org: "Sensing and Robotics for Infrastructure Lab",
        where: "Los Angeles, CA",
        bullets: [
          "Designed and deployed a <b>Graph-based</b> Roadwork Prioritization Platform in <b>React</b> and <b>Node.js</b> with the City of LA, leveraging real-time <b>model tuning</b> and <b>feature engineering</b> to facilitate 30+ user-customizable importance metrics",
          "Co-led 8-person team to architect serverless job scheduling solution updating <b>30,000+</b> datapoints with <b>AWS ECS</b> and <b>S3</b>",
          "Engineered <b>distributed system</b> architecture with <b>load balancing</b>, shortening API response latency from <b>7 to 2</b> seconds",
        ],
      },
      {
        title: "ShorthandML - Deep Learning for Handwriting Recognition",
        when: "Jan. 2025 – Mar. 2025",
        org: "Research Project",
        where: "San Francisco, CA",
        bullets: [
          "Developed hybrid <b>CNN-Transformer-LSTM architecture</b> with <b>multi-head attention</b> and <b>bidirectional encoding</b> for handwritten shorthand recognition, achieving <b>78%</b> character-level accuracy on phonetic-based symbols",
          "Implemented <b>custom weighted CTC loss</b> with <b>beam search decoding</b>, improving rare phoneme detection at over <b>65%</b>",
          "Applied <b>gradient clipping</b> and <b>orthogonal initialization</b> techniques, accelerating model training <b>3.5x</b> at high accuracy",
        ],
      },
    ],
  },
  {
    heading: "Coding Competitions",
    entries: [
      {
        title: "NVIDIA x Vercel World's Shortest Hackathon",
        when: "Jan. 2025",
        bullets: [
          "Selected as <b>finalist</b> (top 5%) building <b>AI platform</b> with <b>NVIDIA NIM</b> for paper-to-video generation within <b>2-hours</b>",
        ],
      },
      {
        title: "Anthropic &amp; Menlo Builder Day",
        when: "Oct. 2024 – Nov. 2024",
        bullets: [
          "Led team to win <b>2nd place</b> ($55,000) with AI-resistant authentication system achieving <b>100%</b> security across <b>1000+</b> tests",
        ],
      },
    ],
  },
  {
    heading: "Education",
    entries: [
      {
        title: "University of San Francisco (USF)",
        when: "Jun. 2024 - Jul. 2025",
        org: "Master of Science, Data Science",
        where: "San Francisco, CA",
        bullets: [],
      },
      {
        title: "University of California, Los Angeles (UCLA)",
        when: "Sep. 2020 - Jun. 2024",
        org: "Bachelor of Science, Mathematics of Computation",
        where: "Los Angeles, CA",
        bullets: [],
      },
    ],
  },
];

const SKILLS: [string, string][] = [
  ["Programming Languages", "Python, SQL, JavaScript, TypeScript, C++, HTML/CSS, Bash, Matlab"],
  ["ML &amp; Data Science", "PyTorch, TensorFlow, scikit-learn, NumPy, Pandas, Matplotlib, LangChain, PySpark, FAISS, A/B Testing"],
  ["Software &amp; Cloud", "AWS (EC2, ECS, Lambda, S3, IAM), Docker, Git, PostgreSQL, Airflow, GCP, React, Node.js, FastAPI, Jira"],
];

const entryHtml = (e: Entry) => `
  <div class="rs-entry">
    <div class="rs-row"><span class="rs-title">${e.title}</span><span class="rs-when">${e.when}</span></div>
    ${e.org ? `<div class="rs-row rs-sub"><span>${e.org}</span><span>${e.where ?? ""}</span></div>` : ""}
    ${e.bullets.length ? `<ul class="rs-bullets">${e.bullets.map(b => `<li>${b}</li>`).join("")}</ul>` : ""}
  </div>`;

export const RESUME_HTML = `
<article class="rs-page">
  <h1 class="rs-name">Lorn Hin Adrian Lam</h1>
  <p class="rs-contact">951-262-3062&nbsp;&nbsp;reachmeonlinkedin@rocketmail.com&nbsp;&nbsp;GitHub&nbsp;&nbsp;Linkedin</p>
  <p class="rs-summary">Machine Learning Engineer with 3+ years of experience, specializing in production ML, generative AI and MLOps</p>
  ${SECTIONS.map(s => `
    <section class="rs-section">
      <h2 class="rs-heading">${s.heading}</h2>
      ${s.entries.map(entryHtml).join("")}
    </section>`).join("")}
  <section class="rs-section">
    <h2 class="rs-heading">Skills</h2>
    <div class="rs-skills">
      ${SKILLS.map(([k, v]) => `<div><b>${k}</b>: ${v}</div>`).join("")}
    </div>
  </section>
</article>`;

// Scoped to .rs-page so nothing leaks into the rest of the app.
export const RESUME_CSS = `
.rs-page{box-sizing:border-box;width:100%;height:100%;padding:4.2% 5.6% 3%;
  background:#fdfbf4;color:#111;font-family:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  line-height:1.28;-webkit-font-smoothing:antialiased;overflow:hidden;
  user-select:text;-webkit-user-select:text;cursor:text}
.rs-page *{box-sizing:border-box;margin:0;padding:0}
.rs-name{font-size:2.9em;font-weight:400;text-align:center;letter-spacing:.01em;line-height:1.1}
.rs-contact{font-size:.92em;text-align:center;margin-top:.25em}
.rs-summary{font-size:.98em;text-align:center;margin:.9em 0 .2em}
.rs-section{margin-top:.62em}
.rs-heading{font-size:1.18em;font-weight:400;font-variant:small-caps;letter-spacing:.03em;
  border-bottom:1px solid #444;padding-bottom:.06em;margin-bottom:.24em}
.rs-entry{margin:.3em 0 .18em;padding-left:1.6%}
.rs-row{display:flex;justify-content:space-between;align-items:baseline;gap:1em}
.rs-title{font-weight:700;font-size:1.02em}
.rs-when{white-space:nowrap;font-size:.98em}
.rs-sub{font-style:italic;font-size:.94em}
.rs-bullets{list-style:none;margin-top:.1em}
.rs-bullets li{position:relative;padding-left:1.15em;font-size:.95em;margin-top:.09em}
.rs-bullets li::before{content:"•";position:absolute;left:.3em}
.rs-skills{padding-left:1.6%;font-size:.95em}
.rs-skills div{margin-top:.08em}
`;
