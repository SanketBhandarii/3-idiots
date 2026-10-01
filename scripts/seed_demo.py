"""Demo workspace seeder: replays a "Cloud Computing" research session through the real capture API.

Every page goes through POST /capture/page (node → Agent 1 → Agent 2 → edges/topics), searches through
POST /capture/search, and the reading timeline through POST /capture/visits, so Research Memory
(time spent, visits, previous/next topic) is derived by the backend exactly as for live browsing.

Usage (backend on :8080 and the AI service running):
  SEED_EMAIL=you@example.com SEED_PASSWORD=... python scripts/seed_demo.py
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar

API = os.environ.get("SEED_API", "http://localhost:8080/api/v1")
TITLE = os.environ.get("SEED_WORKSPACE", "Cloud Computing")

opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with opener.open(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} failed: {e.code} {e.read()[:300]!r}")


YT_SEARCH = "https://www.youtube.com/results?search_query=cloud+computing+explained"
G_SEARCH = "https://www.google.com/search?q=what+is+cloud+computing"

# (kind, url, title, content, opened_from, minutes_read). kind: search | page. Order = research order.
JOURNEY = [
    ("search", G_SEARCH, "what is cloud computing", "", None, 0.5),
    ("page", "https://aws.amazon.com/what-is-cloud-computing/", "What is Cloud Computing? - AWS",
     "Cloud computing is the on-demand delivery of IT resources over the internet with pay-as-you-go pricing. Instead of buying, "
     "owning and maintaining physical data centers and servers, you access compute power, storage and databases from a cloud provider. "
     "Benefits include agility, elasticity, cost savings and the ability to deploy globally in minutes. The main service types are "
     "Infrastructure as a Service (IaaS), Platform as a Service (PaaS) and Software as a Service (SaaS).", G_SEARCH, 4),
    ("page", "https://en.wikipedia.org/wiki/Cloud_computing", "Cloud computing - Wikipedia",
     "Cloud computing is the on-demand availability of computer system resources, especially data storage and computing power, without "
     "direct active management by the user. Large clouds distribute functions over multiple locations, each a data center. The NIST "
     "definition lists five essential characteristics: on-demand self-service, broad network access, resource pooling, rapid elasticity "
     "and measured service. Deployment models are private, public, hybrid and community cloud. History: the term became popular after "
     "Amazon launched Elastic Compute Cloud in 2006.", None, 5),
    ("page", "https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-145.pdf", "The NIST Definition of Cloud Computing (SP 800-145)",
     "NIST Special Publication 800-145 defines cloud computing as a model for enabling ubiquitous, convenient, on-demand network access "
     "to a shared pool of configurable computing resources that can be rapidly provisioned and released with minimal management effort. "
     "The model is composed of five essential characteristics, three service models (SaaS, PaaS, IaaS) and four deployment models "
     "(private, community, public, hybrid). It is the reference definition used by governments and standards bodies.",
     "https://en.wikipedia.org/wiki/Cloud_computing", 6),
    ("page", "https://www2.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-28.pdf", "Above the Clouds: A Berkeley View of Cloud Computing",
     "This UC Berkeley technical report argues that cloud computing is the long-held dream of computing as a utility. It identifies three "
     "new aspects: the illusion of infinite computing resources on demand, the elimination of up-front commitment by users, and the ability "
     "to pay for use of resources on a short-term basis. The report lists ten obstacles and opportunities, including availability of "
     "service, data lock-in, data confidentiality, data transfer bottlenecks and performance unpredictability.", None, 7),
    ("search", YT_SEARCH, "cloud computing explained", "", None, 0.5),
    ("page", "https://www.youtube.com/watch?v=3hLmDS179YE", "AWS Certified Cloud Practitioner Training - Full Course (freeCodeCamp) - YouTube",
     "Video course from freeCodeCamp preparing for the AWS Certified Cloud Practitioner exam. It explains cloud concepts, the shared "
     "responsibility model, AWS global infrastructure with regions and availability zones, core services such as EC2, S3, RDS, Lambda and "
     "VPC, plus pricing, billing and support plans. Includes hands-on demos in the AWS console.", YT_SEARCH, 12),
    ("page", "https://cloud.google.com/learn/what-is-cloud-computing", "What is Cloud Computing? | Google Cloud",
     "Google Cloud explains cloud computing as on-demand access, via the internet, to computing resources such as applications, servers, "
     "storage, development tools and networking hosted at a remote data center managed by a cloud services provider. It compares public, "
     "private, hybrid and multicloud models and the IaaS, PaaS and SaaS service models, and highlights scalability and cost efficiency.", None, 3),
    ("page", "https://azure.microsoft.com/en-us/resources/cloud-computing-dictionary/what-is-cloud-computing",
     "What Is Cloud Computing? | Microsoft Azure",
     "Microsoft Azure describes cloud computing as the delivery of computing services including servers, storage, databases, networking, "
     "software, analytics and intelligence over the internet to offer faster innovation, flexible resources and economies of scale. It "
     "covers the benefits of cost, speed, global scale, productivity, performance and security, and the types of cloud deployment.", None, 3),
    ("page", "https://www.redhat.com/en/topics/cloud-computing/iaas-vs-paas-vs-saas", "IaaS vs PaaS vs SaaS - Red Hat",
     "Red Hat compares the three cloud service models. With IaaS the provider manages servers, storage and networking while you manage the "
     "operating system and applications. With PaaS the provider also manages the runtime and middleware so developers just deploy code. "
     "With SaaS the whole application is delivered over the internet. The choice depends on how much control versus convenience you need.",
     None, 5),
    ("page", "https://www.youtube.com/watch?v=3c-iBn73dDE", "Docker Tutorial for Beginners - TechWorld with Nana - YouTube",
     "Beginner video on Docker containers by TechWorld with Nana. Explains what a container is, how it differs from a virtual machine, "
     "Docker images versus containers, Dockerfiles, Docker Compose, volumes and pushing images to a registry. Containers package an app "
     "with its dependencies so it runs the same on a laptop and in the cloud.", None, 10),
    ("page", "https://docs.docker.com/get-started/docker-overview/", "What is Docker? | Docker Docs",
     "Docker is an open platform for developing, shipping and running applications in containers. The Docker architecture is client-server: "
     "the Docker client talks to the Docker daemon which builds, runs and distributes containers. Images are read-only templates; "
     "containers are runnable instances of images; registries store images. Containers are lightweight and share the host kernel.",
     "https://www.youtube.com/watch?v=3c-iBn73dDE", 4),
    ("page", "https://www.youtube.com/watch?v=X48VuDVv0do", "Kubernetes Tutorial for Beginners [FULL COURSE] - TechWorld with Nana - YouTube",
     "Full beginner course on Kubernetes. Covers what container orchestration is and why it is needed at scale, Kubernetes architecture "
     "with control plane and worker nodes, pods, services, deployments, ConfigMaps, Secrets, StatefulSets, namespaces, Ingress and Helm, "
     "with a hands-on demo deploying an application with minikube and kubectl.", None, 14),
    ("page", "https://kubernetes.io/docs/concepts/overview/", "Overview | Kubernetes",
     "Kubernetes is a portable, extensible, open source platform for managing containerized workloads and services, facilitating both "
     "declarative configuration and automation. It provides service discovery and load balancing, storage orchestration, automated "
     "rollouts and rollbacks, automatic bin packing, self-healing and secret and configuration management. The name originates from Greek "
     "for helmsman; Google open-sourced it in 2014.", "https://www.youtube.com/watch?v=X48VuDVv0do", 5),
    ("page", "https://github.com/kubernetes/kubernetes", "GitHub - kubernetes/kubernetes: Production-Grade Container Scheduling and Management",
     "The Kubernetes source repository on GitHub. Kubernetes is an open source system for managing containerized applications across "
     "multiple hosts, providing basic mechanisms for deployment, maintenance and scaling. It builds on a decade and a half of Google "
     "experience running production workloads (Borg) and is hosted by the Cloud Native Computing Foundation.",
     "https://kubernetes.io/docs/concepts/overview/", 3),
    ("page", "https://martinfowler.com/articles/microservices.html", "Microservices - Martin Fowler",
     "James Lewis and Martin Fowler define the microservice architectural style as developing a single application as a suite of small "
     "services, each running in its own process and communicating with lightweight mechanisms such as HTTP APIs. Services are built "
     "around business capabilities and independently deployable by automated machinery. The article contrasts this with monoliths and "
     "discusses decentralized data management, infrastructure automation and design for failure.", None, 9),
    ("page", "https://12factor.net/", "The Twelve-Factor App",
     "The twelve-factor app is a methodology for building software-as-a-service apps that use declarative formats for setup automation, "
     "have a clean contract with the operating system, are suitable for deployment on modern cloud platforms, minimize divergence between "
     "development and production, and can scale up without significant changes. Factors include codebase, dependencies, config in the "
     "environment, backing services, stateless processes, port binding, concurrency, disposability, dev/prod parity, logs and admin processes.",
     "https://martinfowler.com/articles/microservices.html", 6),
    ("page", "https://en.wikipedia.org/wiki/Serverless_computing", "Serverless computing - Wikipedia",
     "Serverless computing is a cloud execution model in which the provider allocates machine resources on demand, taking care of servers "
     "on behalf of customers. Billing is based on actual usage rather than pre-purchased capacity. Function as a Service (FaaS) platforms "
     "such as AWS Lambda, Azure Functions and Google Cloud Functions run code in response to events. Drawbacks include cold starts, "
     "vendor lock-in and limits on execution time.", None, 4),
    ("page", "https://www.cloudflare.com/learning/serverless/what-is-serverless/", "What is serverless computing? | Cloudflare",
     "Cloudflare explains serverless computing as a method of providing backend services on an as-used basis. Developers write and deploy "
     "code without worrying about the underlying infrastructure; the vendor scales automatically. Advantages: lower costs, simplified "
     "scalability, simplified backend code and quicker turnaround. Disadvantages: harder testing and debugging, security concerns and "
     "vendor lock-in. Edge serverless runs functions close to users to reduce latency.", "https://en.wikipedia.org/wiki/Serverless_computing", 4),
    ("page", "https://aws.amazon.com/lambda/", "Serverless Computing - AWS Lambda",
     "AWS Lambda is a serverless, event-driven compute service that lets you run code for virtually any type of application or backend "
     "service without provisioning or managing servers. You can trigger Lambda from over 200 AWS services and SaaS applications and pay "
     "only for what you use, billed per millisecond. Use cases include file processing, stream processing, web applications and IoT backends.",
     "https://www.cloudflare.com/learning/serverless/what-is-serverless/", 3),
    ("page", "https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html", "AWS Well-Architected Framework",
     "The AWS Well-Architected Framework describes key concepts, design principles and architectural best practices for designing and "
     "running workloads in the cloud. It is built on six pillars: operational excellence, security, reliability, performance efficiency, "
     "cost optimization and sustainability. Each pillar has design principles and questions to review an architecture against.", None, 8),
    ("page", "https://sre.google/sre-book/table-of-contents/", "Site Reliability Engineering (Google SRE Book)",
     "Site Reliability Engineering: How Google Runs Production Systems is a book by Google engineers, free to read online. It introduces SRE "
     "as what happens when you ask a software engineer to design an operations team. Key ideas: service level objectives (SLOs) and error "
     "budgets, eliminating toil, monitoring distributed systems, release engineering, simplicity, on-call practices, postmortem culture "
     "and handling overload and cascading failures.", None, 10),
]
# Revisits (url, minutes): read again later in the session, so Research Memory shows several visits.
REVISITS = [("https://en.wikipedia.org/wiki/Cloud_computing", 2), ("https://kubernetes.io/docs/concepts/overview/", 3),
            ("https://aws.amazon.com/what-is-cloud-computing/", 2)]


def main():
    email, password = os.environ.get("SEED_EMAIL"), os.environ.get("SEED_PASSWORD")
    if not email or not password:
        sys.exit("Set SEED_EMAIL and SEED_PASSWORD")
    call("POST", "/auth/login", {"email": email, "password": password})
    ws = call("POST", "/workspaces", {"title": TITLE, "description": "Demo research session: cloud fundamentals, containers, serverless, reliability."})
    wid = ws["id"]
    session = call("POST", f"/workspaces/{wid}/sessions/start")
    print(f"workspace {wid}  session {session['id']}")

    t = datetime.now(timezone.utc) - timedelta(minutes=170)
    visits = []
    for i, (kind, url, title, text, opened_from, minutes) in enumerate(JOURNEY, 1):
        if kind == "search":
            q = title
            call("POST", "/capture/search", {"query": q, "engine": "youtube" if "youtube" in url else "google", "url": url, "workspace_id": wid})
            print(f"{i:2}. question  {q}")
        else:
            sq = None
            if opened_from in (G_SEARCH, YT_SEARCH):
                sq = next(j[2] for j in JOURNEY if j[1] == opened_from)
            res = call("POST", "/capture/page", {"url": url, "title": title, "content_text": text, "opener_url": opened_from,
                                                 "search_query": sq, "transition": "search_result" if sq else "link",
                                                 "workspace_id": wid, "meta": {}, "outgoing_links": []})
            print(f"{i:2}. page      {title[:70]}  ({'new' if res.get('is_new') else 'existing'})")
            time.sleep(6)  # let Agent 1 embed it before the next page, so Agent 2 sees real candidates
        visits.append({"url": url, "started_at": t.isoformat(), "ended_at": (t + timedelta(minutes=minutes)).isoformat()})
        t += timedelta(minutes=minutes, seconds=20)
        if i in (10, 15, 21):  # revisit after reading a few other pages
            url2, m = REVISITS[(10, 15, 21).index(i)]
            visits.append({"url": url2, "started_at": t.isoformat(), "ended_at": (t + timedelta(minutes=m)).isoformat()})
            t += timedelta(minutes=m, seconds=20)

    res = call("POST", "/capture/visits", {"session_id": session["id"], "visits": visits})
    print(f"visits recorded: {res['accepted']}")
    call("POST", f"/sessions/{session['id']}/stop", {"open_tabs": []})
    print("done - open the workspace; AI analysis finishes in the background")


if __name__ == "__main__":
    main()
