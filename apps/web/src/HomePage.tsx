import { useState, type FormEvent } from "react";

export interface HomePageProps {
  onSignIn: () => void;
  onVerify: (code: string) => void;
}

interface RoleCardText {
  tag: string;
  title: string;
  body: string;
  footer: string;
}

interface FeatureText {
  title: string;
  body: string;
}

interface HomePageText {
  header: {
    tagline: string;
    navAbout: string;
    navEcosystem: string;
    navFeatures: string;
    verify: string;
    signIn: string;
  };
  hero: {
    badge: string;
    headline: string;
    subheadlinePrefix: string;
    subheadlineOrgs: string;
    subheadlineSuffix: string;
    ctaSignIn: string;
    ctaVerify: string;
    metricInstitutionsValue: string;
    metricInstitutionsLabel: string;
    metricTraineesValue: string;
    metricTraineesLabel: string;
    metricVerifiableValue: string;
    metricVerifiableLabel: string;
    liveNetwork: string;
    active: string;
    credentialsTitle: string;
    credentialsSubtitle: string;
    valid: string;
    channelsLabel: string;
    channelTrainee: string;
    channelTrainer: string;
    channelEmployer: string;
    adminPrompt: string;
    adminLink: string;
  };
  institutions: {
    supportedBy: string;
  };
  about: {
    eyebrow: string;
    heading: string;
    body: string;
    address: string;
    point1Title: string;
    point1Body: string;
    point2Title: string;
    point2Body: string;
    point3Title: string;
    point3Body: string;
  };
  roles: {
    badge: string;
    heading: string;
    subheading: string;
    admin: RoleCardText;
    trainer: RoleCardText;
    trainee: RoleCardText;
    employer: RoleCardText;
  };
  features: {
    eyebrow: string;
    heading: string;
    subheading: string;
    items: [
      FeatureText,
      FeatureText,
      FeatureText,
      FeatureText,
      FeatureText,
      FeatureText,
      FeatureText,
      FeatureText,
    ];
  };
  verify: {
    badge: string;
    heading: string;
    body: string;
    formLabel: string;
    placeholder: string;
    verifyBtn: string;
    registryNote: string;
  };
  ctaBanner: {
    heading: string;
    body: string;
    signIn: string;
    help: string;
  };
  footer: {
    about: string;
    hq: string;
    address: string;
    quickLinks: string;
    linkAbout: string;
    linkProgrammes: string;
    linkVerify: string;
    linkNetwork: string;
    linkLogin: string;
    supportLegal: string;
    linkPrivacy: string;
    linkTerms: string;
    linkBiometric: string;
    linkHelp: string;
    linkContact: string;
    copyright: string;
    version: string;
  };
}

const content: Record<"en" | "hi", HomePageText> = {
  en: {
    header: {
      tagline: "Cooperative Training & Certification",
      navAbout: "About",
      navEcosystem: "Ecosystem",
      navFeatures: "Key Features",
      verify: "Verify",
      signIn: "Sign In",
    },
    hero: {
      badge: "National Cooperative Training & Upskilling Initiative",
      headline: "A digital ecosystem for cooperative training, certification, and employment.",
      subheadlinePrefix:
        "Empowering rural youth, PACS staff, and cooperative workers across India through specialized programmes from ",
      subheadlineOrgs: "VAMNICOM, RICMs, and ICMs",
      subheadlineSuffix: " — bridging classroom training to verified career opportunities.",
      ctaSignIn: "Sign In to Dashboard",
      ctaVerify: "Verify a Certificate",
      metricInstitutionsValue: "140+",
      metricInstitutionsLabel: "Partner Institutions",
      metricTraineesValue: "50,000+",
      metricTraineesLabel: "Certified Trainees",
      metricVerifiableValue: "100%",
      metricVerifiableLabel: "Verifiable via QR",
      liveNetwork: "Live National Network",
      active: "Active",
      credentialsTitle: "Tamper-Proof Credentials",
      credentialsSubtitle: "Instant public validity checks",
      valid: "Valid",
      channelsLabel: "Portal Access Channels",
      channelTrainee: "Trainee & Student Portal",
      channelTrainer: "Trainer & Faculty Workspace",
      channelEmployer: "Cooperative Employer Exchange",
      adminPrompt: "Admin or Institution Coordinator?",
      adminLink: "Access Management ERP",
    },
    institutions: {
      supportedBy: "Supported By Leading National Cooperative Organizations",
    },
    about: {
      eyebrow: "About",
      heading: "A statutory mandate to train India's cooperative workforce.",
      body: "EduDisha is a unified digital platform dedicated to organizing cooperative education, research, and leadership programmes across apex, regional, and grassroots cooperative enterprises — delivered in partnership with VAMNICOM, RICMs, and ICMs nationwide.",
      address: "3, Siri Institutional Area, August Kranti Marg, New Delhi - 110016",
      point1Title: "Centralized ERP",
      point1Body:
        "One system for programme registration, nomination, and trainee records across every affiliated institution.",
      point2Title: "Verified Certification",
      point2Body: "Every certificate issued is tamper-proof and independently verifiable, with no login required.",
      point3Title: "National Reach",
      point3Body: "Serving PACS staff, SHG members, dairy cooperative workers, and rural youth across India.",
    },
    roles: {
      badge: "Unified Multi-Persona ERP",
      heading: "Tailored interfaces for every cooperative stakeholder.",
      subheading:
        "A single platform connecting training administrators, certified educators, grassroots trainees, and recruiting cooperative employers.",
      admin: {
        tag: "Governance",
        title: "Admin",
        body: "Institutional CRUD management, batch timetable creation, national nomination approvals, and skill taxonomy oversight.",
        footer: "Regional & Apex Level",
      },
      trainer: {
        tag: "Faculty",
        title: "Trainer",
        body: "Publish course modules, build interactive quizzes, trigger biometric session rosters, and issue verifiable digital credentials.",
        footer: "Institute Instructors",
      },
      trainee: {
        tag: "Learner",
        title: "Trainee",
        body: "Bilingual video lessons, consent-based attendance checks, instant QR certificate downloads, and AI counsellor guidance.",
        footer: "PACS & Rural Youth",
      },
      employer: {
        tag: "Recruiter",
        title: "Employer",
        body: "Post skill-tagged cooperative openings, search verified candidate rosters, shortlist certified graduates, and fill rural vacancies.",
        footer: "Dairies, PACs & Banks",
      },
    },
    features: {
      eyebrow: "Engineered For Indian Cooperatives",
      heading: "Features built for low-connectivity & high trust.",
      subheading:
        "From rural PACS connectivity barriers to high-stakes recruitment, our technical capabilities respect operational realities.",
      items: [
        {
          title: "E-Learning & Offline Access",
          body: "Lightweight, multilingual video and PDF modules optimized for low-bandwidth 2G/4G rural networks with offline caching.",
        },
        {
          title: "Verifiable Certificates",
          body: "Automated grading with tamper-proof, cryptographic digital certificates that can be instantly scanned and authenticated.",
        },
        {
          title: "Biometric Attendance",
          body: "Legally compliant one-time consent biometric face check-in combined with fallback QR scanning for classroom rosters.",
        },
        {
          title: "NFC Profile Sharing",
          body: "Tap-to-verify trainee digital identity cards, enabling instant physical verification during recruitment drives and exams.",
        },
        {
          title: "Employment Exchange",
          body: "A direct pipeline between certified cooperative graduates and open positions across Dairy Unions, Sugar Mills, and PACS.",
        },
        {
          title: "AI Career Counsellor",
          body: "Multilingual AI assistant providing career guidance with explicit provenance tags linking back to completed certifications.",
        },
        {
          title: "Skill-Gap Analysis",
          body: "Target role comparison showing acquired vs. missing skills with AI-recommended sequential courses to bridge qualifications.",
        },
        {
          title: "Automated Talent Match",
          body: "Standardized skills taxonomy automatically pairs qualified candidates with employer job postings based on verified credentials.",
        },
      ],
    },
    verify: {
      badge: "Zero-Login Public Credential Audit",
      heading: "Verify any EduDisha certificate instantly without signing in.",
      body: "Employers, banks, and inspectors can authenticate certificates directly by entering the unique credential code or scanning the printed QR code. Zero login, zero friction, 100% authoritative.",
      formLabel: "Certificate ID or Roll Number",
      placeholder: "e.g. EDU-2024-8A9X",
      verifyBtn: "Verify",
      registryNote: "Connected to Central Registry of Cooperative Training",
    },
    ctaBanner: {
      heading: "Ready to access your training dashboard?",
      body: "Sign in with your registered email or institutional credentials to continue your certified learning path.",
      signIn: "Sign In to EduDisha",
      help: "Help & Registration Support",
    },
    footer: {
      about:
        "EduDisha is a unified digital platform dedicated to organizing cooperative education, research, and leadership programmes across apex, regional, and grassroots cooperative enterprises.",
      hq: "Headquarters:",
      address: "3, Siri Institutional Area, August Kranti Marg, New Delhi - 110016",
      quickLinks: "Quick Links",
      linkAbout: "About EduDisha",
      linkProgrammes: "Programmes & Syllabus",
      linkVerify: "Certificate Verification",
      linkNetwork: "RICM & ICM Network",
      linkLogin: "Portal Login",
      supportLegal: "Support & Legal",
      linkPrivacy: "Privacy Policy",
      linkTerms: "Terms of Service",
      linkBiometric: "Biometric Consent Policy",
      linkHelp: "Help Center & FAQs",
      linkContact: "Contact Nodal Officer",
      copyright: "© 2024 EduDisha. All rights reserved.",
      version: "Version 2.4.0",
    },
  },
  hi: {
    header: {
      tagline: "राष्ट्रीय सहकारी प्रशिक्षण परिषद",
      navAbout: "परिचय",
      navEcosystem: "पारिस्थितिकी तंत्र",
      navFeatures: "मुख्य विशेषताएँ",
      verify: "सत्यापन",
      signIn: "साइन इन",
    },
    hero: {
      badge: "राष्ट्रीय सहकारी प्रशिक्षण एवं कौशल उन्नयन पहल",
      headline: "सहकारी प्रशिक्षण, प्रमाणन और रोज़गार के लिए एक डिजिटल पारिस्थितिकी तंत्र।",
      subheadlinePrefix: "भारत भर में ग्रामीण युवाओं, पैक्स कर्मचारियों और सहकारी श्रमिकों को ",
      subheadlineOrgs: "VAMNICOM, RICM और ICM",
      subheadlineSuffix:
        " के विशेष कार्यक्रमों के माध्यम से सशक्त बनाना — कक्षा प्रशिक्षण को सत्यापित करियर अवसरों से जोड़ते हुए।",
      ctaSignIn: "डैशबोर्ड में साइन इन करें",
      ctaVerify: "प्रमाणपत्र सत्यापित करें",
      metricInstitutionsValue: "140+",
      metricInstitutionsLabel: "सहभागी संस्थान",
      metricTraineesValue: "50,000+",
      metricTraineesLabel: "प्रमाणित प्रशिक्षणार्थी",
      metricVerifiableValue: "100%",
      metricVerifiableLabel: "QR द्वारा सत्यापन योग्य",
      liveNetwork: "लाइव राष्ट्रीय नेटवर्क",
      active: "सक्रिय",
      credentialsTitle: "छेड़छाड़-रहित प्रमाणपत्र",
      credentialsSubtitle: "तुरंत सार्वजनिक वैधता जांच",
      valid: "मान्य",
      channelsLabel: "पोर्टल एक्सेस चैनल",
      channelTrainee: "प्रशिक्षणार्थी एवं छात्र पोर्टल",
      channelTrainer: "प्रशिक्षक एवं संकाय कार्यक्षेत्र",
      channelEmployer: "सहकारी नियोक्ता विनिमय",
      adminPrompt: "प्रशासक या संस्थान समन्वयक?",
      adminLink: "प्रबंधन ERP एक्सेस करें",
    },
    institutions: {
      supportedBy: "अग्रणी राष्ट्रीय सहकारी संगठनों द्वारा समर्थित",
    },
    about: {
      eyebrow: "परिचय",
      heading: "भारत के सहकारी कार्यबल को प्रशिक्षित करने का सांविधिक जनादेश।",
      body: "EduDisha एक एकीकृत डिजिटल प्लेटफ़ॉर्म है जो शीर्ष, क्षेत्रीय और जमीनी स्तर के सहकारी उद्यमों में सहकारी शिक्षा, अनुसंधान और नेतृत्व कार्यक्रमों के आयोजन हेतु समर्पित है — जिसे VAMNICOM, RICM और ICM के सहयोग से देशभर में क्रियान्वित किया जाता है।",
      address: "3, सिरी इंस्टीट्यूशनल एरिया, अगस्त क्रांति मार्ग, नई दिल्ली - 110016",
      point1Title: "केंद्रीकृत ERP",
      point1Body: "सभी संबद्ध संस्थानों में कार्यक्रम पंजीकरण, नामांकन और प्रशिक्षणार्थी रिकॉर्ड के लिए एक ही प्रणाली।",
      point2Title: "सत्यापित प्रमाणन",
      point2Body: "जारी किया गया प्रत्येक प्रमाणपत्र छेड़छाड़-रहित है और बिना लॉगिन के स्वतंत्र रूप से सत्यापित किया जा सकता है।",
      point3Title: "राष्ट्रव्यापी पहुंच",
      point3Body: "भारत भर में पैक्स कर्मचारियों, स्वयं सहायता समूह सदस्यों, डेयरी सहकारी श्रमिकों और ग्रामीण युवाओं की सेवा।",
    },
    roles: {
      badge: "एकीकृत बहु-भूमिका ERP",
      heading: "हर सहकारी हितधारक के लिए अनुकूलित इंटरफ़ेस।",
      subheading:
        "प्रशिक्षण प्रशासकों, प्रमाणित शिक्षकों, जमीनी स्तर के प्रशिक्षणार्थियों और भर्ती करने वाले सहकारी नियोक्ताओं को जोड़ने वाला एक एकल मंच।",
      admin: {
        tag: "शासन",
        title: "प्रशासक",
        body: "संस्थागत CRUD प्रबंधन, बैच समय-सारणी निर्माण, राष्ट्रीय नामांकन अनुमोदन और कौशल वर्गीकरण निरीक्षण।",
        footer: "क्षेत्रीय एवं शीर्ष स्तर",
      },
      trainer: {
        tag: "संकाय",
        title: "प्रशिक्षक",
        body: "कोर्स मॉड्यूल प्रकाशित करें, इंटरैक्टिव क्विज़ बनाएं, बायोमेट्रिक सत्र रोस्टर सक्रिय करें, और सत्यापन योग्य डिजिटल प्रमाणपत्र जारी करें।",
        footer: "संस्थान प्रशिक्षक",
      },
      trainee: {
        tag: "शिक्षार्थी",
        title: "प्रशिक्षणार्थी",
        body: "द्विभाषी वीडियो पाठ, सहमति-आधारित उपस्थिति जांच, तुरंत QR प्रमाणपत्र डाउनलोड, और AI काउंसलर मार्गदर्शन।",
        footer: "पैक्स एवं ग्रामीण युवा",
      },
      employer: {
        tag: "भर्तीकर्ता",
        title: "नियोक्ता",
        body: "कौशल-टैग की गई सहकारी रिक्तियां पोस्ट करें, सत्यापित उम्मीदवार सूची खोजें, प्रमाणित स्नातकों को शॉर्टलिस्ट करें, और ग्रामीण रिक्तियां भरें।",
        footer: "डेयरी, पैक्स एवं बैंक",
      },
    },
    features: {
      eyebrow: "भारतीय सहकारी समितियों के लिए डिज़ाइन किया गया",
      heading: "कम कनेक्टिविटी और उच्च विश्वास के लिए बनाई गई विशेषताएँ।",
      subheading:
        "ग्रामीण पैक्स की कनेक्टिविटी बाधाओं से लेकर उच्च-दांव वाली भर्ती तक, हमारी तकनीकी क्षमताएं परिचालन वास्तविकताओं का सम्मान करती हैं।",
      items: [
        {
          title: "ई-लर्निंग एवं ऑफलाइन एक्सेस",
          body: "कम-बैंडविड्थ 2G/4G ग्रामीण नेटवर्क के लिए अनुकूलित, ऑफलाइन कैशिंग के साथ हल्के, बहुभाषी वीडियो और PDF मॉड्यूल।",
        },
        {
          title: "सत्यापन योग्य प्रमाणपत्र",
          body: "स्वचालित ग्रेडिंग के साथ छेड़छाड़-रहित, क्रिप्टोग्राफ़िक डिजिटल प्रमाणपत्र जिन्हें तुरंत स्कैन और प्रामाणित किया जा सकता है।",
        },
        {
          title: "बायोमेट्रिक उपस्थिति",
          body: "कक्षा रोस्टर के लिए फ़ॉलबैक QR स्कैनिंग के साथ संयुक्त, कानूनी रूप से अनुपालित एक बार की सहमति वाली चेहरा-पहचान चेक-इन।",
        },
        {
          title: "NFC प्रोफ़ाइल साझाकरण",
          body: "टैप-टू-वेरीफाई प्रशिक्षणार्थी डिजिटल पहचान कार्ड, भर्ती अभियानों और परीक्षाओं के दौरान तुरंत भौतिक सत्यापन सक्षम करना।",
        },
        {
          title: "रोज़गार विनिमय",
          body: "प्रमाणित सहकारी स्नातकों और डेयरी यूनियनों, चीनी मिलों तथा पैक्स में खुली रिक्तियों के बीच सीधा संपर्क।",
        },
        {
          title: "AI करियर काउंसलर",
          body: "पूर्ण किए गए प्रमाणपत्रों से जुड़े स्पष्ट प्रमाण टैग के साथ करियर मार्गदर्शन प्रदान करने वाला बहुभाषी AI सहायक।",
        },
        {
          title: "कौशल-अंतर विश्लेषण",
          body: "अर्जित बनाम आवश्यक कौशल दिखाने वाली लक्ष्य भूमिका तुलना, योग्यताओं को पूरा करने के लिए AI-अनुशंसित क्रमिक पाठ्यक्रमों के साथ।",
        },
        {
          title: "स्वचालित प्रतिभा मिलान",
          body: "मानकीकृत कौशल वर्गीकरण स्वचालित रूप से योग्य उम्मीदवारों को सत्यापित प्रमाणपत्रों के आधार पर नियोक्ता नौकरी पोस्टिंग से जोड़ता है।",
        },
      ],
    },
    verify: {
      badge: "बिना लॉगिन सार्वजनिक प्रमाणपत्र ऑडिट",
      heading: "बिना साइन इन किए तुरंत किसी भी EduDisha प्रमाणपत्र को सत्यापित करें।",
      body: "नियोक्ता, बैंक और निरीक्षक अद्वितीय क्रेडेंशियल कोड दर्ज करके या मुद्रित QR कोड को स्कैन करके सीधे प्रमाणपत्रों को प्रामाणित कर सकते हैं। शून्य लॉगिन, शून्य बाधा, 100% प्रामाणिक।",
      formLabel: "प्रमाणपत्र आईडी या रोल नंबर",
      placeholder: "उदा. EDU-2024-8A9X",
      verifyBtn: "सत्यापित करें",
      registryNote: "राष्ट्रीय सहकारी प्रशिक्षण केंद्रीय रजिस्ट्री से जुड़ा हुआ",
    },
    ctaBanner: {
      heading: "अपने प्रशिक्षण डैशबोर्ड तक पहुंचने के लिए तैयार हैं?",
      body: "अपनी प्रमाणित शिक्षण यात्रा जारी रखने के लिए अपने पंजीकृत ईमेल या संस्थागत क्रेडेंशियल से साइन इन करें।",
      signIn: "EduDisha में साइन इन करें",
      help: "सहायता एवं पंजीकरण सहायता",
    },
    footer: {
      about:
        "EduDisha एक एकीकृत डिजिटल प्लेटफ़ॉर्म है जो शीर्ष, क्षेत्रीय और जमीनी स्तर के सहकारी उद्यमों में सहकारी शिक्षा, अनुसंधान और नेतृत्व कार्यक्रमों के आयोजन हेतु समर्पित है।",
      hq: "मुख्यालय:",
      address: "3, सिरी इंस्टीट्यूशनल एरिया, अगस्त क्रांति मार्ग, नई दिल्ली - 110016",
      quickLinks: "त्वरित लिंक",
      linkAbout: "EduDisha के बारे में",
      linkProgrammes: "कार्यक्रम एवं पाठ्यक्रम",
      linkVerify: "प्रमाणपत्र सत्यापन",
      linkNetwork: "RICM एवं ICM नेटवर्क",
      linkLogin: "पोर्टल लॉगिन",
      supportLegal: "सहायता एवं कानूनी",
      linkPrivacy: "गोपनीयता नीति",
      linkTerms: "सेवा की शर्तें",
      linkBiometric: "बायोमेट्रिक सहमति नीति",
      linkHelp: "सहायता केंद्र एवं सामान्य प्रश्न",
      linkContact: "नोडल अधिकारी से संपर्क करें",
      copyright: "© 2024 EduDisha। सर्वाधिकार सुरक्षित।",
      version: "संस्करण 2.4.0",
    },
  },
};

interface LocaleSwitcherProps {
  locale: "en" | "hi";
  onChange: (locale: "en" | "hi") => void;
  pillClassName: string;
}

function LocaleSwitcher({ locale, onChange, pillClassName }: LocaleSwitcherProps) {
  return (
    <div className={pillClassName}>
      <span className="material-symbols-outlined text-base text-interactive">translate</span>
      <button
        type="button"
        onClick={() => onChange("en")}
        aria-pressed={locale === "en"}
        className={`cursor-pointer ${locale === "en" ? "font-bold text-primary" : "text-on-surface-variant hover:text-primary"}`}
      >
        English
      </button>
      <span className="text-gray-300">|</span>
      <button
        type="button"
        onClick={() => onChange("hi")}
        aria-pressed={locale === "hi"}
        className={`cursor-pointer ${locale === "hi" ? "font-bold text-primary" : "text-on-surface-variant hover:text-primary"}`}
      >
        हिन्दी
      </button>
    </div>
  );
}

export function HomePage({ onSignIn, onVerify }: HomePageProps) {
  const [certInput, setCertInput] = useState("");
  const [locale, setLocale] = useState<"en" | "hi">("en");
  const t = content[locale];

  const handleVerifySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (certInput.trim()) {
      onVerify(certInput.trim());
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-background text-left font-body" lang={locale}>
      {/* Primary Sticky Header */}
      <header className="sticky top-0 z-40 bg-surface-card border-b border-border-low-contrast shadow-xs">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16 h-20 flex items-center justify-between">
          {/* Left: Logo & Wordmark */}
          <a href="#" className="flex items-center gap-3.5 group">
            <div className="w-11 h-11 rounded-std bg-primary flex items-center justify-center text-on-primary shadow-xs group-hover:bg-primary-container transition-colors">
              <span className="material-symbols-outlined text-[26px]">school</span>
            </div>
            <div className="flex flex-col">
              <span className="font-heading font-extrabold text-xl md:text-2xl text-primary leading-tight tracking-tight">
                NCCT Platform
              </span>
              <span className="text-[11px] font-medium text-on-surface-variant hidden sm:block">
                {t.header.tagline}
              </span>
            </div>
          </a>

          {/* Center: Public Navigation (Desktop) */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-on-surface-variant">
            <a href="#about" className="hover:text-primary transition-colors py-2">
              {t.header.navAbout}
            </a>
            <a href="#roles" className="hover:text-primary transition-colors py-2">
              {t.header.navEcosystem}
            </a>
            <a href="#features" className="hover:text-primary transition-colors py-2">
              {t.header.navFeatures}
            </a>
          </nav>

          {/* Right: Action CTA Buttons */}
          <div className="flex items-center gap-3">
            <LocaleSwitcher
              locale={locale}
              onChange={setLocale}
              pillClassName="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-low-contrast bg-surface-card text-xs font-semibold text-primary"
            />
            <a
              href="#verify"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 h-11 rounded-std border border-border-low-contrast bg-surface-card text-on-background text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              <span className="material-symbols-outlined text-lg text-interactive">qr_code_scanner</span>
              <span>{t.header.verify}</span>
            </a>
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center justify-center px-6 h-11 rounded-full bg-cta hover:bg-cta-hover text-white text-sm font-bold shadow-xs hover:shadow transition-all min-w-[104px] cursor-pointer"
            >
              {t.header.signIn}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden border-b border-border-low-contrast bg-gradient-to-b from-white to-[#f4f4f2]/40">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Hero Content */}
            <div className="lg:col-span-7 flex flex-col items-start">
              {/* Trust Badge Pill */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-primary text-xs font-semibold mb-6">
                <span className="material-symbols-outlined text-base text-cta">verified</span>
                <span>{t.hero.badge}</span>
              </div>

              {/* Headline */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[52px] font-heading font-extrabold text-primary leading-[1.15] tracking-tight mb-6">
                {t.hero.headline}
              </h1>

              {/* Subheadline */}
              <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed mb-8 max-w-2xl font-normal">
                {t.hero.subheadlinePrefix}
                <span className="font-semibold text-primary">{t.hero.subheadlineOrgs}</span>
                {t.hero.subheadlineSuffix}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center justify-center gap-2.5 px-8 h-12 rounded-full bg-cta hover:bg-cta-hover text-white text-base font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                >
                  <span>{t.hero.ctaSignIn}</span>
                  <span className="material-symbols-outlined text-xl">arrow_forward</span>
                </button>
                <a
                  href="#verify"
                  className="inline-flex items-center justify-center gap-2 px-6 h-12 rounded-std border-2 border-primary/20 bg-surface-card hover:bg-primary/5 text-primary text-base font-bold transition-colors"
                >
                  <span className="material-symbols-outlined text-xl text-interactive">search_check</span>
                  <span>{t.hero.ctaVerify}</span>
                </a>
              </div>

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-3 gap-6 sm:gap-10 pt-10 mt-10 border-t border-border-low-contrast w-full">
                <div>
                  <p className="font-heading font-extrabold text-2xl sm:text-3xl text-primary">
                    {t.hero.metricInstitutionsValue}
                  </p>
                  <p className="text-xs sm:text-sm text-on-surface-variant font-medium mt-0.5">
                    {t.hero.metricInstitutionsLabel}
                  </p>
                </div>
                <div>
                  <p className="font-heading font-extrabold text-2xl sm:text-3xl text-primary">
                    {t.hero.metricTraineesValue}
                  </p>
                  <p className="text-xs sm:text-sm text-on-surface-variant font-medium mt-0.5">
                    {t.hero.metricTraineesLabel}
                  </p>
                </div>
                <div>
                  <p className="font-heading font-extrabold text-2xl sm:text-3xl text-status-shortlisted">
                    {t.hero.metricVerifiableValue}
                  </p>
                  <p className="text-xs sm:text-sm text-on-surface-variant font-medium mt-0.5">
                    {t.hero.metricVerifiableLabel}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Hero Visual Card */}
            <div className="lg:col-span-5 relative">
              <div className="bg-surface-card border border-border-low-contrast rounded-std p-6 sm:p-7 shadow-xs relative z-10">
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-border-low-contrast">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-heading font-bold text-sm text-primary">{t.hero.liveNetwork}</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-status-shortlisted border border-emerald-200">
                    {t.hero.active}
                  </span>
                </div>

                {/* Mini verification demo teaser inside hero */}
                <div className="bg-background rounded-std p-4 border border-border-low-contrast mb-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-std bg-primary text-white flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl">workspace_premium</span>
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-primary">{t.hero.credentialsTitle}</h2>
                      <p className="text-[11px] text-on-surface-variant">{t.hero.credentialsSubtitle}</p>
                    </div>
                  </div>
                  <div className="mt-2 bg-white rounded p-2.5 border border-border-low-contrast flex items-center justify-between text-xs">
                    <span className="font-mono text-gray-600">NCCT-2024-8A9X</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-status-shortlisted">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      {t.hero.valid}
                    </span>
                  </div>
                </div>

                {/* Role Quick-Link List */}
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                  {t.hero.channelsLabel}
                </p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="w-full flex items-center justify-between p-3 rounded-std bg-white hover:bg-gray-50 border border-border-low-contrast transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-xl">person</span>
                      <span className="text-xs font-bold text-primary">{t.hero.channelTrainee}</span>
                    </div>
                    <span className="material-symbols-outlined text-gray-400 text-sm">arrow_forward_ios</span>
                  </button>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="w-full flex items-center justify-between p-3 rounded-std bg-white hover:bg-gray-50 border border-border-low-contrast transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-xl">co_present</span>
                      <span className="text-xs font-bold text-primary">{t.hero.channelTrainer}</span>
                    </div>
                    <span className="material-symbols-outlined text-gray-400 text-sm">arrow_forward_ios</span>
                  </button>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="w-full flex items-center justify-between p-3 rounded-std bg-white hover:bg-gray-50 border border-border-low-contrast transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-xl">business_center</span>
                      <span className="text-xs font-bold text-primary">{t.hero.channelEmployer}</span>
                    </div>
                    <span className="material-symbols-outlined text-gray-400 text-sm">arrow_forward_ios</span>
                  </button>
                </div>

                <div className="mt-5 pt-4 border-t border-border-low-contrast text-center">
                  <span className="text-xs text-on-surface-variant">
                    {t.hero.adminPrompt}{" "}
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="font-bold text-interactive hover:underline cursor-pointer inline"
                    >
                      {t.hero.adminLink}
                    </button>
                  </span>
                </div>
              </div>
              {/* Decorative Background Element */}
              <div className="absolute -bottom-6 -right-6 w-full h-full bg-primary-container/5 rounded-std -z-0 hidden sm:block"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Participating Cooperative Apex Institutions */}
      <section className="py-8 bg-surface-card border-b border-border-low-contrast">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-6">
            {t.institutions.supportedBy}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 opacity-80">
            <div className="flex items-center gap-2 font-heading font-extrabold text-lg text-primary">
              <span className="material-symbols-outlined text-2xl text-cta">agriculture</span>
              <span>IFFCO</span>
            </div>
            <div className="flex items-center gap-2 font-heading font-extrabold text-lg text-primary">
              <span className="material-symbols-outlined text-2xl text-cta">water_drop</span>
              <span>AMUL</span>
            </div>
            <div className="flex items-center gap-2 font-heading font-extrabold text-lg text-primary">
              <span className="material-symbols-outlined text-2xl text-cta">account_balance</span>
              <span>NABARD</span>
            </div>
            <div className="flex items-center gap-2 font-heading font-extrabold text-lg text-primary">
              <span className="material-symbols-outlined text-2xl text-cta">storefront</span>
              <span>NCDC</span>
            </div>
            <div className="flex items-center gap-2 font-heading font-extrabold text-lg text-primary">
              <span className="material-symbols-outlined text-2xl text-cta">school</span>
              <span>VAMNICOM</span>
            </div>
          </div>
        </div>
      </section>

      {/* About NCCT Section */}
      <section id="about" className="scroll-mt-20 py-16 md:py-24 bg-surface-card border-b border-border-low-contrast">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5">
              <span className="text-xs font-bold uppercase tracking-widest text-cta">{t.about.eyebrow}</span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold text-primary tracking-tight mt-2 mb-4">
                {t.about.heading}
              </h2>
              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed mb-4">{t.about.body}</p>
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-lg text-primary">location_on</span>
                <span>{t.about.address}</span>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-background border border-border-low-contrast rounded-std p-6">
                <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-interactive mb-4 shadow-xs">
                  <span className="material-symbols-outlined text-2xl">hub</span>
                </div>
                <h3 className="font-heading font-bold text-base text-primary mb-2">{t.about.point1Title}</h3>
                <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.about.point1Body}</p>
              </div>
              <div className="bg-background border border-border-low-contrast rounded-std p-6">
                <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-cta mb-4 shadow-xs">
                  <span className="material-symbols-outlined text-2xl">workspace_premium</span>
                </div>
                <h3 className="font-heading font-bold text-base text-primary mb-2">{t.about.point2Title}</h3>
                <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.about.point2Body}</p>
              </div>
              <div className="bg-background border border-border-low-contrast rounded-std p-6">
                <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-status-shortlisted mb-4 shadow-xs">
                  <span className="material-symbols-outlined text-2xl">public</span>
                </div>
                <h3 className="font-heading font-bold text-base text-primary mb-2">{t.about.point3Title}</h3>
                <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.about.point3Body}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Four Core Personas / Roles (Bento-style Grid) */}
      <section id="roles" className="scroll-mt-20 py-16 md:py-24 bg-background">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16">
          {/* Section Header */}
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-interactive/10 text-interactive text-xs font-bold mb-3">
              <span>{t.roles.badge}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold text-primary tracking-tight">
              {t.roles.heading}
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant mt-3 font-normal">{t.roles.subheading}</p>
          </div>

          {/* 4 Bento-style Role Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: Admin */}
            <div
              onClick={onSignIn}
              className="bg-surface-card border border-primary/30 rounded-std p-6 hover:shadow-md transition-all flex flex-col justify-between ring-1 ring-primary/20 cursor-pointer group"
            >
              <div>
                <div className="w-12 h-12 rounded-std bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5 group-hover:bg-primary group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-2xl">admin_panel_settings</span>
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary text-white mb-2">
                  {t.roles.admin.tag}
                </span>
                <h3 className="text-lg font-heading font-bold text-primary mb-2">{t.roles.admin.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{t.roles.admin.body}</p>
              </div>
              <div className="pt-6 mt-6 border-t border-border-low-contrast flex items-center justify-between text-xs font-semibold text-primary">
                <span>{t.roles.admin.footer}</span>
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </div>
            </div>

            {/* Card 2: Trainer */}
            <div
              onClick={onSignIn}
              className="bg-surface-card border border-interactive/30 rounded-std p-6 hover:shadow-md transition-all flex flex-col justify-between ring-1 ring-interactive/20 cursor-pointer group"
            >
              <div>
                <div className="w-12 h-12 rounded-std bg-interactive/10 border border-interactive/20 flex items-center justify-center text-interactive mb-5 group-hover:bg-interactive group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-2xl">co_present</span>
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-interactive text-white mb-2">
                  {t.roles.trainer.tag}
                </span>
                <h3 className="text-lg font-heading font-bold text-primary mb-2">{t.roles.trainer.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{t.roles.trainer.body}</p>
              </div>
              <div className="pt-6 mt-6 border-t border-border-low-contrast flex items-center justify-between text-xs font-semibold text-interactive">
                <span>{t.roles.trainer.footer}</span>
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </div>
            </div>

            {/* Card 3: Trainee */}
            <div
              onClick={onSignIn}
              className="bg-surface-card border border-cta/30 rounded-std p-6 hover:shadow-md transition-all flex flex-col justify-between ring-1 ring-cta/20 cursor-pointer group"
            >
              <div>
                <div className="w-12 h-12 rounded-std bg-cta/10 border border-cta/20 flex items-center justify-center text-cta mb-5 group-hover:bg-cta group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-2xl">school</span>
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cta text-white mb-2">
                  {t.roles.trainee.tag}
                </span>
                <h3 className="text-lg font-heading font-bold text-primary mb-2">{t.roles.trainee.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{t.roles.trainee.body}</p>
              </div>
              <div className="pt-6 mt-6 border-t border-border-low-contrast flex items-center justify-between text-xs font-semibold text-cta">
                <span>{t.roles.trainee.footer}</span>
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </div>
            </div>

            {/* Card 4: Employer */}
            <div
              onClick={onSignIn}
              className="bg-surface-card border border-status-shortlisted/30 rounded-std p-6 hover:shadow-md transition-all flex flex-col justify-between ring-1 ring-status-shortlisted/20 cursor-pointer group"
            >
              <div>
                <div className="w-12 h-12 rounded-std bg-status-shortlisted/10 border border-status-shortlisted/20 flex items-center justify-center text-status-shortlisted mb-5 group-hover:bg-status-shortlisted group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-2xl">business_center</span>
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-status-shortlisted text-white mb-2">
                  {t.roles.employer.tag}
                </span>
                <h3 className="text-lg font-heading font-bold text-primary mb-2">{t.roles.employer.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{t.roles.employer.body}</p>
              </div>
              <div className="pt-6 mt-6 border-t border-border-low-contrast flex items-center justify-between text-xs font-semibold text-status-shortlisted">
                <span>{t.roles.employer.footer}</span>
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Feature Highlights Grid (8 Cards) */}
      <section id="features" className="scroll-mt-20 py-16 md:py-24 bg-surface-card border-y border-border-low-contrast">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-14">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-cta">{t.features.eyebrow}</span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold text-primary tracking-tight mt-2">
                {t.features.heading}
              </h2>
            </div>
            <p className="text-sm text-on-surface-variant max-w-md mt-4 md:mt-0">{t.features.subheading}</p>
          </div>

          {/* Grid of 8 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* 1. E-Learning & Offline Access */}
            <div className="bg-background border border-border-low-contrast rounded-std p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-primary mb-4 shadow-xs">
                <span className="material-symbols-outlined text-2xl text-interactive">cloud_download</span>
              </div>
              <h3 className="font-heading font-bold text-base text-primary mb-2">{t.features.items[0].title}</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.features.items[0].body}</p>
            </div>

            {/* 2. Auto-Graded Assessments & Certificates */}
            <div className="bg-background border border-border-low-contrast rounded-std p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-primary mb-4 shadow-xs">
                <span className="material-symbols-outlined text-2xl text-interactive">verified</span>
              </div>
              <h3 className="font-heading font-bold text-base text-primary mb-2">{t.features.items[1].title}</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.features.items[1].body}</p>
            </div>

            {/* 3. QR & Face-Recognition Attendance */}
            <div className="bg-background border border-border-low-contrast rounded-std p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-primary mb-4 shadow-xs">
                <span className="material-symbols-outlined text-2xl text-interactive">face</span>
              </div>
              <h3 className="font-heading font-bold text-base text-primary mb-2">{t.features.items[2].title}</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.features.items[2].body}</p>
            </div>

            {/* 4. NFC Profile Sharing */}
            <div className="bg-background border border-border-low-contrast rounded-std p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-primary mb-4 shadow-xs">
                <span className="material-symbols-outlined text-2xl text-interactive">contactless</span>
              </div>
              <h3 className="font-heading font-bold text-base text-primary mb-2">{t.features.items[3].title}</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.features.items[3].body}</p>
            </div>

            {/* 5. Employer Exchange */}
            <div className="bg-background border border-border-low-contrast rounded-std p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-primary mb-4 shadow-xs">
                <span className="material-symbols-outlined text-2xl text-interactive">handshake</span>
              </div>
              <h3 className="font-heading font-bold text-base text-primary mb-2">{t.features.items[4].title}</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.features.items[4].body}</p>
            </div>

            {/* 6. AI Career Counsellor */}
            <div className="bg-background border border-border-low-contrast rounded-std p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-primary mb-4 shadow-xs">
                <span className="material-symbols-outlined text-2xl text-cta">smart_toy</span>
              </div>
              <h3 className="font-heading font-bold text-base text-primary mb-2">{t.features.items[5].title}</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.features.items[5].body}</p>
            </div>

            {/* 7. Skill-Gap Analysis */}
            <div className="bg-background border border-border-low-contrast rounded-std p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-primary mb-4 shadow-xs">
                <span className="material-symbols-outlined text-2xl text-interactive">troubleshoot</span>
              </div>
              <h3 className="font-heading font-bold text-base text-primary mb-2">{t.features.items[6].title}</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.features.items[6].body}</p>
            </div>

            {/* 8. Automated Talent Match */}
            <div className="bg-background border border-border-low-contrast rounded-std p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-std bg-surface-card border border-border-low-contrast flex items-center justify-center text-primary mb-4 shadow-xs">
                <span className="material-symbols-outlined text-2xl text-interactive">badge</span>
              </div>
              <h3 className="font-heading font-bold text-base text-primary mb-2">{t.features.items[7].title}</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{t.features.items[7].body}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Public Trust & Certificate Verification Strip */}
      <section id="verify" className="scroll-mt-20 py-16 bg-gradient-to-r from-primary to-primary-container text-on-primary">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16">
          <div className="bg-white/5 border border-white/10 rounded-std p-8 md:p-12 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold mb-4">
                <span className="material-symbols-outlined text-sm">lock_open</span>
                <span>{t.verify.badge}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-white tracking-tight">
                {t.verify.heading}
              </h2>
              <p className="text-white/80 text-sm sm:text-base mt-3 leading-relaxed">{t.verify.body}</p>
            </div>

            {/* Verification Quick Input Box */}
            <form
              onSubmit={handleVerifySubmit}
              className="w-full lg:w-[420px] bg-surface-card rounded-std p-5 text-on-background shadow-xl"
            >
              <label htmlFor="cert-id" className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                {t.verify.formLabel}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-3 top-3 text-gray-400 text-lg">search</span>
                  <input
                    id="cert-id"
                    type="text"
                    placeholder={t.verify.placeholder}
                    value={certInput}
                    onChange={(e) => setCertInput(e.target.value)}
                    className="w-full h-11 pl-9 pr-3 rounded-std border border-border-low-contrast text-sm focus:outline-hidden focus:border-primary font-mono text-primary"
                  />
                </div>
                <button
                  type="submit"
                  className="h-11 px-5 rounded-full bg-cta hover:bg-cta-hover text-white text-xs font-bold flex items-center justify-center transition-colors cursor-pointer"
                >
                  {t.verify.verifyBtn}
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-2.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-status-shortlisted">check_circle</span>
                <span>{t.verify.registryNote}</span>
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* CTA Banner Section */}
      <section className="py-16 md:py-20 bg-background border-b border-border-low-contrast">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold text-primary tracking-tight mb-4">
              {t.ctaBanner.heading}
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant mb-8">{t.ctaBanner.body}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={onSignIn}
                className="w-full sm:w-auto px-8 h-12 rounded-full bg-cta hover:bg-cta-hover text-white font-bold text-sm shadow-md hover:shadow transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{t.ctaBanner.signIn}</span>
                <span className="material-symbols-outlined text-lg">login</span>
              </button>
              <a
                href="#help"
                className="w-full sm:w-auto px-6 h-12 rounded-std border border-border-low-contrast bg-surface-card hover:bg-gray-50 text-primary font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">support_agent</span>
                <span>{t.ctaBanner.help}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Official Footer */}
      <footer className="bg-surface-card text-on-background border-t border-border-low-contrast pt-12 pb-8">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 md:px-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-12 border-b border-border-low-contrast">
            {/* Col 1: Brand & Autonomous Society Info */}
            <div className="md:col-span-2 pr-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-std bg-primary flex items-center justify-center text-on-primary">
                  <span className="material-symbols-outlined text-xl">school</span>
                </div>
                <span className="font-heading font-extrabold text-xl text-primary tracking-tight">NCCT Platform</span>
              </div>
              <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed mb-4 max-w-md">
                {t.footer.about}
              </p>
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <span className="font-semibold text-primary">{t.footer.hq}</span> {t.footer.address}
              </div>
            </div>

            {/* Col 2: Navigation Links */}
            <div>
              <h4 className="font-heading font-bold text-sm text-primary uppercase tracking-wider mb-4">
                {t.footer.quickLinks}
              </h4>
              <ul className="space-y-2.5 text-xs sm:text-sm text-on-surface-variant font-medium">
                <li>
                  <a href="#about" className="hover:text-primary transition-colors">
                    {t.footer.linkAbout}
                  </a>
                </li>
                <li>
                  <a href="#roles" className="hover:text-primary transition-colors">
                    {t.footer.linkProgrammes}
                  </a>
                </li>
                <li>
                  <a href="#verify" className="hover:text-primary transition-colors">
                    {t.footer.linkVerify}
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-primary transition-colors">
                    {t.footer.linkNetwork}
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="hover:text-primary transition-colors cursor-pointer text-left"
                  >
                    {t.footer.linkLogin}
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: Support & Policies */}
            <div id="help" className="scroll-mt-20">
              <h4 className="font-heading font-bold text-sm text-primary uppercase tracking-wider mb-4">
                {t.footer.supportLegal}
              </h4>
              <ul className="space-y-2.5 text-xs sm:text-sm text-on-surface-variant font-medium">
                <li>
                  <a href="#about" className="hover:text-primary transition-colors">
                    {t.footer.linkPrivacy}
                  </a>
                </li>
                <li>
                  <a href="#about" className="hover:text-primary transition-colors">
                    {t.footer.linkTerms}
                  </a>
                </li>
                <li>
                  <a href="#about" className="hover:text-primary transition-colors">
                    {t.footer.linkBiometric}
                  </a>
                </li>
                <li>
                  <a href="#about" className="hover:text-primary transition-colors">
                    {t.footer.linkHelp}
                  </a>
                </li>
                <li>
                  <a href="#about" className="hover:text-primary transition-colors">
                    {t.footer.linkContact}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar with Locale Selector */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-on-surface-variant">
            <div>{t.footer.copyright}</div>

            {/* Locale Switcher Pill */}
            <div className="flex items-center gap-3">
              <LocaleSwitcher
                locale={locale}
                onChange={setLocale}
                pillClassName="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-low-contrast bg-background text-xs font-semibold text-primary"
              />
              <span className="text-gray-400">|</span>
              <span className="font-medium">{t.footer.version}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
