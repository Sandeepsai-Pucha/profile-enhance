"""
seed_data.py
─────────────
Populates the database with realistic test data so the whole team
can run and demo the app without needing real Google Drive files.

Run once after setting up the DB:
  python seed_data.py

Safe to re-run: skips rows that already exist (by email / title).
"""

from database import SessionLocal, engine, Base
from models import CandidateProfile, JobDescription, User, SkillCategory, MatchResult

# ── Create all tables first ───────────────────────────────────
Base.metadata.create_all(bind=engine)

db = SessionLocal()


# ═══════════════════════════════════════════════════════════════
# 1. DEMO USER (simulates a Google OAuth login)
# ═══════════════════════════════════════════════════════════════
DEMO_USERS = [
    {
        "google_id":     "demo_google_id_001",
        "email":         "recruiter@skillify.demo",
        "name":          "Priya Sharma",
        "avatar_url":    "https://i.pravatar.cc/150?u=priya",
        "access_token":  "demo_access_token",
        "refresh_token": "demo_refresh_token",
    },
]

for u in DEMO_USERS:
    if not db.query(User).filter(User.email == u["email"]).first():
        db.add(User(**u))
        print(f"  [User] Created: {u['email']}")

db.commit()


# ═══════════════════════════════════════════════════════════════
# 2. CANDIDATE PROFILES
#    10 diverse candidates covering different tech stacks
# ═══════════════════════════════════════════════════════════════
CANDIDATES = [
    {
        "name":             "Arjun Mehta",
        "email":            "arjun.mehta@example.com",
        "phone":            "+91-9876543210",
        "current_role":     "Senior Python Developer",
        "experience_years": 6,
        "skills":           ["Python", "FastAPI", "Django", "PostgreSQL", "Redis",
                             "Docker", "AWS", "REST APIs", "SQLAlchemy", "Celery"],
        "education":        "B.Tech Computer Science – IIT Hyderabad (2018)",
        "summary":          "Backend specialist with 6 years building scalable APIs and microservices.",
        "resume_text": """
Arjun Mehta | arjun.mehta@example.com | +91-9876543210
Senior Python Developer – 6 Years Experience

SKILLS
Python, FastAPI, Django, PostgreSQL, Redis, Docker, AWS (EC2, S3, Lambda),
REST APIs, SQLAlchemy, Celery, pytest, GitHub Actions, Linux

EXPERIENCE
Senior Backend Developer | TechCorp Hyderabad (2021–Present)
- Designed and built microservices handling 500K req/day using FastAPI + PostgreSQL
- Reduced API latency by 40% by introducing Redis caching layer
- Led migration from monolith to microservices architecture

Python Developer | DataSoft Solutions (2018–2021)
- Built Django REST APIs for e-commerce platform (2M users)
- Automated deployment pipelines with Docker + GitHub Actions

EDUCATION
B.Tech Computer Science – IIT Hyderabad (2018)
""",
    },
    {
        "name":             "Sneha Reddy",
        "email":            "sneha.reddy@example.com",
        "phone":            "+91-9123456780",
        "current_role":     "Full Stack Developer",
        "experience_years": 4,
        "skills":           ["React", "Node.js", "TypeScript", "MongoDB", "Express",
                             "GraphQL", "Tailwind CSS", "Docker", "Firebase"],
        "education":        "B.E. IT – BITS Pilani (2020)",
        "summary":          "Full-stack engineer with React + Node expertise and a strong UI sense.",
        "resume_text": """
Sneha Reddy | sneha.reddy@example.com
Full Stack Developer – 4 Years

SKILLS
React, Next.js, TypeScript, Node.js, Express, MongoDB, GraphQL,
Tailwind CSS, Firebase, Docker, Jest, GitHub Actions

EXPERIENCE
Full Stack Developer | StartupX Bangalore (2022–Present)
- Built React + Node.js SaaS product from scratch (0 → 10K users)
- Designed GraphQL API replacing 15 REST endpoints
- Implemented real-time notifications using WebSockets

Frontend Developer | Accenture (2020–2022)
- Maintained React application for Fortune 500 banking client
- Improved Lighthouse performance score from 42 → 89

EDUCATION
B.E. Information Technology – BITS Pilani (2020)
""",
    },
    {
        "name":             "Ravi Kumar",
        "email":            "ravi.kumar@example.com",
        "phone":            "+91-9988776655",
        "current_role":     "DevOps Engineer",
        "experience_years": 5,
        "skills":           ["Kubernetes", "Docker", "AWS", "Terraform", "Jenkins",
                             "Ansible", "Linux", "Python", "Helm", "Prometheus", "Grafana"],
        "education":        "B.Tech ECE – NIT Warangal (2019)",
        "summary":          "DevOps engineer specialising in Kubernetes and cloud infrastructure automation.",
        "resume_text": """
Ravi Kumar | ravi.kumar@example.com
DevOps Engineer – 5 Years

SKILLS
Kubernetes, Docker, AWS (EKS, RDS, VPC), Terraform, Jenkins, Ansible,
Python scripting, Helm, Prometheus, Grafana, GitOps, Linux

EXPERIENCE
Senior DevOps Engineer | CloudBase India (2021–Present)
- Managed 50-node Kubernetes cluster on AWS EKS
- Reduced infrastructure costs by 30% via Terraform auto-scaling policies
- Built CI/CD pipelines for 20+ microservices (Jenkins + ArgoCD)

DevOps Engineer | Infosys (2019–2021)
- Containerised legacy Java apps with Docker
- Set up monitoring dashboards with Prometheus + Grafana

EDUCATION
B.Tech Electronics – NIT Warangal (2019)
""",
    },
    {
        "name":             "Anjali Patel",
        "email":            "anjali.patel@example.com",
        "phone":            "+91-9001122334",
        "current_role":     "Data Scientist",
        "experience_years": 3,
        "skills":           ["Python", "Machine Learning", "TensorFlow", "PyTorch",
                             "Pandas", "NumPy", "Scikit-learn", "SQL", "Jupyter", "MLflow"],
        "education":        "M.Tech AI – IISc Bangalore (2021)",
        "summary":          "ML engineer with hands-on experience in NLP and computer vision models.",
        "resume_text": """
Anjali Patel | anjali.patel@example.com
Data Scientist – 3 Years

SKILLS
Python, TensorFlow, PyTorch, Scikit-learn, Pandas, NumPy, SQL,
Hugging Face Transformers, MLflow, Jupyter, SpaCy, OpenCV

EXPERIENCE
Data Scientist | AI Labs Hyderabad (2021–Present)
- Fine-tuned BERT model for resume classification (92% accuracy)
- Built real-time fraud detection pipeline processing 100K txns/day
- Deployed ML models to production using FastAPI + Docker

Research Intern | IISc AI Lab (2020–2021)
- Published paper on GAN-based data augmentation (ICML workshop)

EDUCATION
M.Tech Artificial Intelligence – IISc Bangalore (2021)
B.Tech CSE – VIT Vellore (2019)
""",
    },
    {
        "name":             "Mohammed Faraz",
        "email":            "faraz.khan@example.com",
        "phone":            "+91-9765432109",
        "current_role":     "Backend Developer",
        "experience_years": 2,
        "skills":           ["Python", "Flask", "MySQL", "REST APIs", "Git",
                             "Postman", "Linux", "HTML", "CSS"],
        "education":        "B.Tech CSE – Osmania University (2022)",
        "summary":          "Junior backend developer with Flask/MySQL experience, eager to grow into FastAPI.",
        "resume_text": """
Mohammed Faraz | faraz.khan@example.com
Backend Developer – 2 Years

SKILLS
Python, Flask, MySQL, REST APIs, Git, Postman, Linux, HTML, CSS, Bootstrap

EXPERIENCE
Backend Developer | WebApps Hyderabad (2022–Present)
- Built 10+ REST APIs using Flask for internal tools
- Managed MySQL databases with 500K+ records
- Integrated third-party payment APIs (Razorpay, PayU)

Intern | TCS (2021–2022)
- Automated data entry workflows using Python scripts

EDUCATION
B.Tech Computer Science – Osmania University (2022)
""",
    },
    {
        "name":             "Kavitha Nair",
        "email":            "kavitha.nair@example.com",
        "phone":            "+91-9832165490",
        "current_role":     "React Developer",
        "experience_years": 3,
        "skills":           ["React", "JavaScript", "TypeScript", "Redux", "Tailwind CSS",
                             "REST APIs", "Git", "Figma", "Jest", "Webpack"],
        "education":        "B.Tech IT – Kerala Technical University (2021)",
        "summary":          "Frontend specialist building responsive React applications with clean UX.",
        "resume_text": """
Kavitha Nair | kavitha.nair@example.com
React Developer – 3 Years

SKILLS
React, JavaScript, TypeScript, Redux Toolkit, Tailwind CSS,
REST APIs, Jest, React Testing Library, Webpack, Figma, Git

EXPERIENCE
Frontend Developer | FinTech Startup Kochi (2022–Present)
- Built customer-facing dashboard processing real-time stock data
- Reduced bundle size by 45% via code splitting and lazy loading
- Wrote unit/integration tests achieving 80% coverage

Junior Frontend Developer | HCL Technologies (2021–2022)
- Developed React components for enterprise HR portal

EDUCATION
B.Tech Information Technology – KTU Kerala (2021)
""",
    },
    {
        "name":             "Suresh Babu",
        "email":            "suresh.babu@example.com",
        "phone":            "+91-9654321087",
        "current_role":     "Java Backend Developer",
        "experience_years": 7,
        "skills":           ["Java", "Spring Boot", "Microservices", "PostgreSQL",
                             "Kafka", "Docker", "AWS", "REST APIs", "Maven", "JUnit"],
        "education":        "B.Tech CSE – Andhra University (2017)",
        "summary":          "Senior Java developer with microservices architecture and Kafka streaming expertise.",
        "resume_text": """
Suresh Babu | suresh.babu@example.com
Java Backend Developer – 7 Years

SKILLS
Java 17, Spring Boot, Spring Security, Microservices, PostgreSQL,
Apache Kafka, Docker, AWS (EC2, S3, RDS), REST APIs, Maven, JUnit 5, Mockito

EXPERIENCE
Senior Java Developer | Enterprise Solutions Hyderabad (2020–Present)
- Architected event-driven microservices using Spring Boot + Kafka
- Designed multi-tenant SaaS backend serving 500 enterprise clients
- Led team of 6 developers, conducted code reviews

Java Developer | Wipro (2017–2020)
- Developed Spring Boot REST APIs for banking application
- Wrote comprehensive JUnit test suite (85% code coverage)

EDUCATION
B.Tech Computer Science – Andhra University (2017)
""",
    },
    {
        "name":             "Deepika Ramesh",
        "email":            "deepika.ramesh@example.com",
        "phone":            "+91-9741230987",
        "current_role":     "Cloud Architect",
        "experience_years": 8,
        "skills":           ["AWS", "Azure", "GCP", "Terraform", "Kubernetes",
                             "Python", "Security", "Cost Optimisation", "CloudFormation", "CDK"],
        "education":        "B.E. CSE – Anna University (2016) | AWS Solutions Architect Professional",
        "summary":          "Cloud architect with multi-cloud expertise and AWS Professional certification.",
        "resume_text": """
Deepika Ramesh | deepika.ramesh@example.com
Cloud Architect – 8 Years | AWS SAP | Azure Solutions Expert

SKILLS
AWS (30+ services), Azure, GCP, Terraform, CDK, CloudFormation,
Kubernetes (EKS/AKS), Python, Security & Compliance, FinOps, Serverless

EXPERIENCE
Cloud Architect | Global Consulting Firm Chennai (2019–Present)
- Designed multi-region AWS architecture for BFSI client (99.99% uptime)
- Achieved 40% cloud cost reduction through FinOps implementation
- Led cloud migration of 200+ applications from on-prem to AWS

Senior Cloud Engineer | Cognizant (2016–2019)
- Built CI/CD pipelines on Azure DevOps for 50 client projects

CERTIFICATIONS
AWS Solutions Architect Professional | Azure Solutions Expert | GCP Associate

EDUCATION
B.E. Computer Science – Anna University (2016)
""",
    },
    {
        "name":             "Vikram Singh",
        "email":            "vikram.singh@example.com",
        "phone":            "+91-9876012345",
        "current_role":     "AI/ML Engineer",
        "experience_years": 5,
        "skills":           ["Python", "Machine Learning", "LLMs", "LangChain",
                             "OpenAI API", "FastAPI", "PostgreSQL", "Docker", "Vector Databases", "RAG"],
        "education":        "M.Tech CS – IIT Delhi (2019)",
        "summary":          "AI engineer specialising in LLM applications, RAG pipelines, and agentic systems.",
        "resume_text": """
Vikram Singh | vikram.singh@example.com
AI/ML Engineer – 5 Years (LLMs & GenAI Focus)

SKILLS
Python, LangChain, OpenAI/Anthropic APIs, LlamaIndex, Pinecone, pgvector,
FastAPI, Docker, PostgreSQL, Hugging Face, Prompt Engineering, RAG, Agents

EXPERIENCE
Senior AI Engineer | GenAI Studio Delhi (2022–Present)
- Built enterprise RAG chatbot (LangChain + pgvector) for legal document QA
- Reduced hallucination rate by 60% via hybrid retrieval + re-ranking
- Deployed fine-tuned Mistral model for code generation (RLHF)

ML Engineer | Microsoft India (2019–2022)
- Developed NLP pipeline for email classification (98% accuracy)
- Built recommendation engine powering Outlook suggestions

EDUCATION
M.Tech Computer Science – IIT Delhi (2019)
""",
    },
    {
        "name":             "Pooja Iyer",
        "email":            "pooja.iyer@example.com",
        "phone":            "+91-9345678901",
        "current_role":     "QA / SDET Engineer",
        "experience_years": 4,
        "skills":           ["Selenium", "Pytest", "Java", "TestNG", "API Testing",
                             "Postman", "JIRA", "CI/CD", "Performance Testing", "JMeter"],
        "education":        "B.Tech CSE – Manipal University (2020)",
        "summary":          "SDET with automation expertise across UI, API, and performance testing.",
        "resume_text": """
Pooja Iyer | pooja.iyer@example.com
QA / SDET Engineer – 4 Years

SKILLS
Selenium WebDriver, Pytest, Java, TestNG, Cucumber BDD,
REST Assured, Postman, JMeter, JIRA, CI/CD (Jenkins), Git

EXPERIENCE
SDET | E-Commerce Giant Bangalore (2022–Present)
- Built automated regression suite covering 2000+ test cases (Selenium + TestNG)
- Reduced release cycle from 2 weeks to 3 days via CI/CD test automation
- Conducted JMeter performance testing for Black Friday load (1M concurrent users)

QA Engineer | Tech Mahindra (2020–2022)
- Manual + automated testing for healthcare web application
- Created BDD test scenarios using Cucumber

EDUCATION
B.Tech Computer Science – Manipal University (2020)
""",
    },
]

added_candidates = 0
for c in CANDIDATES:
    if not db.query(CandidateProfile).filter(CandidateProfile.email == c["email"]).first():
        db.add(CandidateProfile(**c))
        added_candidates += 1
        print(f"  [Candidate] Created: {c['name']}")

db.commit()


# ═══════════════════════════════════════════════════════════════
# 3. JOB DESCRIPTIONS (seed JDs for demo matching)
# ═══════════════════════════════════════════════════════════════
demo_user = db.query(User).filter(User.email == "recruiter@skillify.demo").first()

JOB_DESCRIPTIONS = [
    {
        "title":           "Senior Python Backend Developer",
        "company":         "FinTech Innovations Pvt Ltd",
        "uploaded_by":     demo_user.id if demo_user else None,
        "required_skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "AWS",
                            "Redis", "REST APIs", "Celery", "SQLAlchemy"],
        "experience_min":  4,
        "experience_max":  8,
        "jd_text": """
Senior Python Backend Developer – FinTech Innovations Pvt Ltd, Hyderabad

About the Role:
We are looking for an experienced Python Backend Developer to join our growing FinTech team.
You will design and build high-performance APIs serving millions of financial transactions.

Required Skills & Experience:
- 4–8 years of Python backend development
- Strong proficiency in FastAPI or Django REST Framework
- PostgreSQL (advanced queries, indexing, optimisation)
- Redis for caching and message queuing
- Celery for distributed task processing
- SQLAlchemy ORM
- Docker containerisation
- AWS (EC2, S3, Lambda, RDS)
- REST API design best practices
- Experience with high-throughput financial systems preferred

Nice to Have:
- Kafka or RabbitMQ experience
- Kubernetes
- GraphQL

Responsibilities:
- Design and develop scalable REST APIs
- Optimise database queries for performance
- Lead code reviews and mentor junior developers
- Collaborate with DevOps for CI/CD pipelines

Location: Hyderabad (Hybrid – 3 days/week)
CTC: ₹18–28 LPA
""",
    },
    {
        "title":           "Full Stack React + Node.js Developer",
        "company":         "SaaS Startup – Remote",
        "uploaded_by":     demo_user.id if demo_user else None,
        "required_skills": ["React", "TypeScript", "Node.js", "MongoDB", "GraphQL",
                            "Tailwind CSS", "Docker", "REST APIs", "Jest"],
        "experience_min":  2,
        "experience_max":  5,
        "jd_text": """
Full Stack Developer (React + Node.js) – Remote SaaS Startup

We are a fast-growing SaaS startup building the next generation of project management tools.

Must Have:
- 2–5 years full-stack experience
- React with TypeScript (hooks, context, Redux Toolkit)
- Node.js + Express or NestJS
- GraphQL API design
- MongoDB / Mongoose
- Tailwind CSS for responsive UI
- Docker for containerisation
- Jest + React Testing Library

Good to Have:
- Next.js SSR/SSG
- Firebase / Supabase
- AWS or GCP deployment

Responsibilities:
- Build features end-to-end from design mockup to production
- Collaborate with product designers using Figma
- Write comprehensive tests
- Participate in on-call rotation

Location: 100% Remote (IST timezone)
CTC: ₹12–20 LPA
""",
    },
    {
        "title":           "AI/ML Engineer – LLM Applications",
        "company":         "GenAI Research Lab",
        "uploaded_by":     demo_user.id if demo_user else None,
        "required_skills": ["Python", "LangChain", "OpenAI API", "FastAPI",
                            "Vector Databases", "RAG", "Machine Learning", "Docker"],
        "experience_min":  3,
        "experience_max":  7,
        "jd_text": """
AI/ML Engineer – LLM Applications | GenAI Research Lab, Bangalore

Role Overview:
We are pioneering enterprise AI applications using Large Language Models.
You will build production-grade RAG pipelines, AI agents, and LLM-powered features.

Required:
- 3–7 years ML/AI engineering experience
- Python (expert level)
- LangChain or LlamaIndex framework
- OpenAI / Anthropic / Google API integration
- Vector databases (Pinecone, pgvector, Weaviate)
- RAG pipeline design and optimisation
- FastAPI for model serving
- Docker + basic MLOps

Strong Plus:
- Fine-tuning LLMs (LoRA, QLoRA, RLHF)
- Prompt engineering and evaluation
- Hugging Face ecosystem
- Knowledge of AI safety and alignment

Location: Bangalore / Remote
CTC: ₹20–35 LPA
""",
    },
    {
        "title":           "DevOps / Cloud Engineer",
        "company":         "Enterprise Cloud Solutions",
        "uploaded_by":     demo_user.id if demo_user else None,
        "required_skills": ["Kubernetes", "Docker", "AWS", "Terraform", "Jenkins",
                            "Ansible", "Python", "Linux", "Prometheus", "Grafana"],
        "experience_min":  3,
        "experience_max":  7,
        "jd_text": """
DevOps / Cloud Engineer – Enterprise Cloud Solutions, Hyderabad

We manage cloud infrastructure for 50+ enterprise clients across BFSI, Healthcare, and Retail.

Mandatory Skills:
- 3–7 years DevOps / cloud experience
- Kubernetes (EKS/GKE/AKS) – cluster management, Helm charts
- Docker containerisation
- AWS (must have), Azure or GCP (nice to have)
- Terraform for IaC
- Jenkins or GitLab CI for CI/CD
- Ansible for configuration management
- Python scripting (automation)
- Prometheus + Grafana for monitoring
- Linux (RHEL/Ubuntu) administration

Preferred:
- ArgoCD / FluxCD (GitOps)
- Istio service mesh
- CKA / AWS certifications

CTC: ₹15–25 LPA | Location: Hyderabad (on-site)
""",
    },
]

added_jds = 0
for j in JOB_DESCRIPTIONS:
    if not db.query(JobDescription).filter(JobDescription.title == j["title"]).first():
        db.add(JobDescription(**j))
        added_jds += 1
        print(f"  [JD] Created: {j['title']}")

db.commit()


# ═══════════════════════════════════════════════════════════════
# 4. SKILL CATEGORY LIBRARY (for Profile Library Mapping panel)
# ═══════════════════════════════════════════════════════════════
SKILL_CATEGORIES = [
    {
        "category": "Backend",
        "skills":   ["Python", "FastAPI", "Django", "Flask", "Node.js", "Java",
                     "Spring Boot", "Go", "Ruby on Rails", "REST APIs", "GraphQL"],
        "roles":    ["Backend Developer", "API Engineer", "Platform Engineer"],
    },
    {
        "category": "Frontend",
        "skills":   ["React", "Angular", "Vue.js", "TypeScript", "JavaScript",
                     "Next.js", "Tailwind CSS", "Redux", "HTML", "CSS"],
        "roles":    ["Frontend Developer", "UI Engineer", "React Developer"],
    },
    {
        "category": "DevOps & Cloud",
        "skills":   ["Kubernetes", "Docker", "AWS", "Azure", "GCP", "Terraform",
                     "Jenkins", "Ansible", "Prometheus", "Grafana", "Helm"],
        "roles":    ["DevOps Engineer", "SRE", "Cloud Architect", "Platform Engineer"],
    },
    {
        "category": "Data & AI",
        "skills":   ["Python", "TensorFlow", "PyTorch", "Scikit-learn", "Pandas",
                     "SQL", "Spark", "Kafka", "LangChain", "RAG", "MLflow"],
        "roles":    ["Data Scientist", "ML Engineer", "AI Engineer", "Data Analyst"],
    },
    {
        "category": "Databases",
        "skills":   ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
                     "Cassandra", "SQLite", "DynamoDB", "Snowflake"],
        "roles":    ["Database Administrator", "Backend Developer", "Data Engineer"],
    },
    {
        "category": "QA & Testing",
        "skills":   ["Selenium", "Pytest", "JUnit", "Postman", "JMeter",
                     "TestNG", "Cucumber", "Cypress", "k6", "REST Assured"],
        "roles":    ["QA Engineer", "SDET", "Test Automation Engineer"],
    },
]

for sc in SKILL_CATEGORIES:
    if not db.query(SkillCategory).filter(SkillCategory.category == sc["category"]).first():
        db.add(SkillCategory(**sc))
        print(f"  [SkillCategory] Created: {sc['category']}")

db.commit()

db.close()

print(f"""
╔══════════════════════════════════════════╗
║  ✅  Seed Data Loaded Successfully!      ║
╠══════════════════════════════════════════╣
║  Users      : {len(DEMO_USERS)} demo user(s)               ║
║  Candidates : {len(CANDIDATES)} profiles                   ║
║  Job Descs  : {len(JOB_DESCRIPTIONS)} sample JDs                  ║
║  Skill Cats : {len(SKILL_CATEGORIES)} categories                  ║
╠══════════════════════════════════════════╣
║  Login email: recruiter@skillify.demo   ║
║  (Use Google OAuth to log in as Priya)  ║
╚══════════════════════════════════════════╝
""")
