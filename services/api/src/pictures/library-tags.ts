/**
 * Hand-curated tags for the shipped template pictures (apps/web/public/template-assets/<key>.jpg).
 * Derived from the original generation prompts in scripts/template-images.ts (copied, not imported).
 * Keys follow `<category>-<slot>`; slots 1,2,8 are wide, 3,4,9 tall, 5,6 square, 7,10 standard.
 * Prototype pictures re-used from an earlier lab (`=name` entries) are deliberately left untagged.
 */
export interface LibraryTag {
  description: string
  keywords: string[]
}

const t = (description: string, keywords: string): LibraryTag => ({ description, keywords: keywords.split(/\s+/).filter(Boolean) })

export const LIBRARY_TAGS: Record<string, LibraryTag> = {
  // pitch
  'pitch-6': t('Close-up of a firm handshake between two business people in a bright office', 'handshake agreement partnership deal partner business investor office'),
  'pitch-7': t('Founders whiteboarding a product roadmap with colourful sticky notes', 'founder startup whiteboard roadmap sticky notes planning brainstorm team product'),
  'pitch-8': t('Sleek 3D rocket launching with a glowing trail on a dark navy background', 'rocket launch startup growth liftoff takeoff speed ambition vision'),
  'pitch-9': t('Confident founder presenting on stage to a blurred audience', 'presenter presentation stage speaker keynote audience talk pitch founder conference'),
  // sales
  'sales-1': t('Two business professionals shaking hands across a modern conference table', 'handshake deal agreement client customer partner meeting business negotiation'),
  'sales-2': t('Sales team celebrating a closed deal in an open-plan office', 'sales team celebrate celebration success win deal target achievement office'),
  'sales-3': t('Salesperson presenting a proposal on a tablet to a client', 'salesperson sales proposal client tablet presentation offer customer pitch'),
  'sales-4': t('Customer success manager on a video call wearing a headset', 'customer support success service headset call video remote helpdesk agent'),
  'sales-5': t('Signed contract with a fountain pen and coffee on a wooden table', 'contract signing signature agreement pen document legal paperwork terms'),
  'sales-6': t('Laptop showing a colourful sales pipeline funnel chart', 'pipeline funnel sales chart laptop leads conversion crm forecast'),
  'sales-7': t('Handshake over a table with documents and a laptop', 'handshake documents laptop deal agreement contract business'),
  'sales-8': t('City skyline at sunrise seen through a boardroom window', 'city skyline sunrise boardroom window corporate vision growth morning office'),
  'sales-10': t('Team gathered around a table reviewing printed proposals', 'team proposal review documents meeting table discussion collaboration'),
  // marketing
  'marketing-2': t('Billboard and street advertising in a vibrant city at golden hour', 'billboard advertising advert outdoor street city campaign brand marketing'),
  'marketing-7': t('Creative team brainstorming with colourful sticky notes on a glass wall', 'creative team brainstorm brainstorming sticky notes ideas workshop campaign ideation'),
  'marketing-8': t('Social media creators filming content with a ring light in a studio', 'social media content creator filming video influencer studio camera ring light'),
  'marketing-10': t('Overhead shot of a laptop with analytics charts beside coffee and notebook', 'analytics laptop charts metrics data performance report dashboard desk marketing'),
  // strategy
  'strategy-3': t('Chess pieces on a board with the king in focus', 'chess strategy king move tactic competition competitor planning decision'),
  'strategy-4': t('CEO standing in front of a large window with a city skyline', 'ceo executive leader leadership director vision skyline window thoughtful'),
  'strategy-6': t('Whiteboard with a strategy diagram and sticky notes', 'whiteboard strategy diagram sticky notes planning framework workshop roadmap'),
  'strategy-8': t('Sailing ship on a calm ocean at sunrise', 'sailing ship ocean sea sunrise journey voyage direction navigation horizon'),
  'strategy-9': t('Woman looking over a city from a high-rise at dusk, silhouette', 'woman city highrise dusk silhouette outlook future vision skyline reflection'),
  'strategy-10': t('Stack of reports and a tablet showing charts on a boardroom table', 'reports tablet charts boardroom table analysis documents review figures'),
  // product
  'product-1': t('Product team around a table with laptops and a prototype phone in a design studio', 'product team prototype phone laptops design studio collaboration development'),
  'product-2': t('Floating glass app screens and UI cards in 3D on a soft gradient', 'app screens interface ui ux design digital mockup glass cards software'),
  'product-4': t('Developer wearing headphones coding on dual monitors', 'developer programmer coding code software engineering monitors debugging bug testing programming'),
  'product-5': t('3D smartphone with colourful floating app icons', 'smartphone phone mobile app icons apps 3d software'),
  'product-6': t('Wireframe sketches on paper beside a pen and sticky notes', 'wireframe sketch prototype design paper ux ui draft concept mockup'),
  'product-7': t('Kanban board with sticky notes on a wall in a bright office', 'kanban board agile scrum sprint sticky notes backlog tasks workflow project'),
  'product-9': t('Woman user-testing an app on a tablet in a cafe', 'user testing usability test app tablet feedback research qa customer experience'),
  'product-10': t('Product roadmap timeline drawn on a glass wall with markers', 'roadmap timeline milestones plan schedule glass wall markers release product'),
  // tech
  'tech-1': t('Futuristic data centre with glowing blue server racks', 'data centre datacenter servers server racks infrastructure hosting cloud hardware network'),
  'tech-2': t('Abstract network of glowing nodes and connections on a dark background', 'network nodes connections graph abstract data digital connectivity ai technology'),
  'tech-3': t('Engineer in a server room holding a tablet in blue light', 'engineer server room tablet infrastructure monitoring maintenance operations technology it'),
  'tech-5': t('Macro photo of a circuit board with blue light', 'circuit board chip electronics hardware semiconductor processor technology macro'),
  'tech-6': t('3D glowing cloud made of cubes and lines on a dark background', 'cloud computing storage saas 3d cubes digital infrastructure technology'),
  'tech-7': t('Team reviewing a software architecture diagram on a large monitor', 'software architecture diagram system design review engineers team code technology'),
  'tech-9': t('Cybersecurity analyst in front of several monitors in blue light', 'cybersecurity security analyst monitors threat vulnerability bug hacking protection soc incident'),
  // reports
  'reports-1': t('Modern analytics dashboard on a large monitor in a dark office', 'analytics dashboard monitor data charts metrics kpi reporting business intelligence'),
  'reports-2': t('Aerial view of a business district with geometric patterns in daylight', 'aerial business district city buildings downtown skyline urban corporate'),
  'reports-4': t('Woman reviewing printed financial reports with a pen', 'financial reports finance review accounting audit documents numbers budget'),
  'reports-6': t('3D colourful bar chart blocks rising on a pastel background', 'bar chart growth 3d blocks statistics increase data graph'),
  'reports-7': t('Team reviewing quarterly results on a screen in a meeting', 'quarterly results team meeting screen performance review revenue kpi'),
  'reports-8': t('Sunrise over skyscrapers symbolising growth', 'sunrise skyscrapers growth skyline new beginning market optimism city'),
  'reports-10': t('Laptop with a line chart, a notebook and a coffee, flat lay', 'laptop line chart trend notebook coffee desk flat lay data analysis'),
  // education
  'education-2': t('Modern lecture hall with students and a presenter', 'lecture hall students university lecture presenter classroom auditorium education'),
  'education-4': t('Young student reading under a tree with a notebook', 'student reading tree notebook study outdoors learning book'),
  'education-6': t('Colourful classroom supplies arranged flat lay: pencils, notebooks, small globe', 'classroom supplies pencils notebooks globe school stationery learning back to school'),
  'education-8': t('Graduates throwing caps in the air at golden hour', 'graduation graduates caps ceremony celebrate university degree achievement'),
  'education-9': t('Teacher helping a student with a tablet in a bright classroom', 'teacher student tablet classroom teaching help learning edtech school'),
  // case-studies
  'case-studies-1': t('Consultants presenting to a client team in a modern meeting room', 'consultants consulting presenting client team meeting room advisory workshop'),
  'case-studies-2': t('Busy modern warehouse with workers and organised shelves', 'warehouse logistics shelves workers supply chain inventory distribution storage'),
  'case-studies-4': t('Engineer in a hard hat reviewing plans at a construction site at sunrise', 'engineer hard hat construction site plans building infrastructure project safety'),
  'case-studies-5': t('Tidy organised shelf close-up, before-and-after concept', 'shelf organised tidy organization before after improvement efficiency retail'),
  'case-studies-7': t('Workshop with colourful sticky notes on a wall and people discussing', 'workshop sticky notes discussion collaboration brainstorm team ideas facilitation'),
  'case-studies-9': t('Customer service agent with a headset smiling at a desk', 'customer service agent headset support call centre helpdesk contact'),
  'case-studies-10': t('Team celebrating success with a high-five in an office', 'team success celebrate highfive achievement win results office'),
  // team
  'team-1': t('Diverse team laughing together around a table in a bright office', 'team diverse laughing culture colleagues office collaboration together'),
  'team-2': t('Company offsite picnic on a sunny lawn', 'offsite picnic company event outdoor lawn social retreat culture celebration'),
  'team-3': t('New employee being welcomed with a handshake at the office door', 'new employee welcome onboarding hiring handshake recruitment hire office door'),
  'team-4': t('Woman smiling at her desk surrounded by plants in a bright office', 'woman desk plants office workplace wellbeing employee comfort'),
  'team-5': t('Team high-five over a table with coffee cups, top-down', 'team highfive coffee cups together teamwork top-down collaboration'),
  'team-6': t('Colourful office kitchen with healthy snacks and a fruit bowl', 'kitchen snacks fruit healthy perks benefits office food wellness'),
  'team-8': t('Happy diverse team posing outdoors in front of an office building', 'team group portrait outdoors office building diverse company people'),
  'team-10': t('Employees volunteering together planting trees', 'volunteering trees planting sustainability community environment csr green charity'),
}

export const LIBRARY_KEYS = Object.keys(LIBRARY_TAGS)
