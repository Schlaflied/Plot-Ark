import { motion } from 'framer-motion';
import {ArrowRight, BookOpen, Layers, GitBranch, BrainCircuit } from 'lucide-react';
import logoUrl from './assets/logo.png';
import researchUrl from './assets/research.gif';
import knowledgeUrl from './assets/knowledge.gif';

function App() {
  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: "easeOut" }
  };

  const staggerContainer = {
    animate: {
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  return (
    <div className="min-h-screen bg-nobel-cream font-sans text-nobel-dark selection:bg-nobel-gold/30">
      {/* Navigation */}
      <nav className="fixed w-full top-0 z-50 bg-nobel-cream/80 backdrop-blur-md border-b border-nobel-gold/20">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Plot Ark Logo" className="h-10 w-10 object-contain" />
            <span className="font-serif font-bold text-2xl tracking-tight">Plot Ark</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/Schlaflied/Plot-Ark" className="flex items-center gap-2 text-nobel-dark hover:text-nobel-gold transition-colors font-medium">
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center max-w-4xl mx-auto mt-20"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-nobel-gold/10 text-nobel-gold font-medium mb-8 border border-nobel-gold/20">
              <BrainCircuit className="w-4 h-4" />
              <span>Open Source Agentic Framework</span>
            </div>
            
            <h1 className="text-6xl md:text-7xl font-serif font-bold leading-tight mb-8">
              The Engine That Thinks
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-nobel-gold to-yellow-600">
                Before It Teaches.
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
              Plot Ark applies evidence-based instructional design principles—Bloom's Taxonomy, Krashen's i+1, and Cognitive Load Theory—so the curriculum it generates is structured the way learning actually works.
            </p>

            <div className="flex items-center justify-center gap-4">
              <a 
                href="https://github.com/Schlaflied/Plot-Ark"
                className="inline-flex items-center gap-2 px-8 py-4 bg-nobel-dark text-white rounded-full font-medium hover:bg-black transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                View on GitHub
              </a>
              <a 
                href="#features"
                className="inline-flex items-center gap-2 px-8 py-4 bg-nobel-cream text-nobel-dark border-2 border-nobel-dark rounded-full font-medium hover:bg-nobel-dark hover:text-white transition-all"
              >
                Explore Features
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </motion.div>

          {/* Features Grid */}
          <motion.div 
            id="features"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-40"
          >
            <motion.div variants={fadeIn} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-nobel-gold/10 rounded-2xl flex items-center justify-center mb-6">
                <BookOpen className="w-7 h-7 text-nobel-gold" />
              </div>
              <h3 className="text-2xl font-serif font-bold mb-4">Pedagogically Grounded</h3>
              <p className="text-gray-600 leading-relaxed">
                Automatically maps course codes to Bloom's Taxonomy and ensures i+1 difficulty progression across modules. Max 2 readings per module to respect Cognitive Load.
              </p>
            </motion.div>

            <motion.div variants={fadeIn} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-nobel-gold/10 rounded-2xl flex items-center justify-center mb-6">
                <Layers className="w-7 h-7 text-nobel-gold" />
              </div>
              <h3 className="text-2xl font-serif font-bold mb-4">Multi-Agent Analytics</h3>
              <p className="text-gray-600 leading-relaxed">
                5-node Hive architecture. Processes xAPI statements through Risk Detector, Behavior Analyst, and Content Optimizer to flag at-risk learners instantly.
              </p>
            </motion.div>

            <motion.div variants={fadeIn} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-nobel-gold/10 rounded-2xl flex items-center justify-center mb-6">
                <GitBranch className="w-7 h-7 text-nobel-gold" />
              </div>
              <h3 className="text-2xl font-serif font-bold mb-4">Knowledge Graph RAG</h3>
              <p className="text-gray-600 leading-relaxed">
                Drop your syllabus PDFs. Plot Ark uses LightRAG to extract interconnected concepts, building a visual, queryable force-directed network.
              </p>
            </motion.div>
          </motion.div>

          {/* Demos Section */}
          <div className="mt-40 mb-20 space-y-32">
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="flex flex-col lg:flex-row items-center gap-16"
            >
              <div className="lg:w-1/2">
                <h2 className="text-4xl font-serif font-bold mb-6">Agentic Research. <br/>Human in the Loop.</h2>
                <p className="text-lg text-gray-600 leading-relaxed mb-8">
                  Tavily agent runs multi-type queries across academic, video, and news domains before generation begins. Humans approve or reject the verified URLs so there are no hallucinated citations.
                </p>
              </div>
              <div className="lg:w-1/2">
                <div className="rounded-2xl overflow-hidden shadow-2xl border border-nobel-gold/20">
                  <img src={researchUrl} alt="Research Agent Demo" className="w-full h-auto" />
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="flex flex-col lg:flex-row-reverse items-center gap-16"
            >
              <div className="lg:w-1/2">
                <h2 className="text-4xl font-serif font-bold mb-6">Interactive Knowledge Graphs</h2>
                <p className="text-lg text-gray-600 leading-relaxed mb-8">
                  Ingest PPTXs and PDFs to construct an interactive 2D graph with warm aesthetics. Click any concept to see its definition, or ask natural language queries against the semantic network.
                </p>
              </div>
              <div className="lg:w-1/2">
                <div className="rounded-2xl overflow-hidden shadow-2xl border border-nobel-gold/20 bg-nobel-dark p-2">
                  <img src={knowledgeUrl} alt="Knowledge Graph Demo" className="w-full h-auto rounded-xl" />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-nobel-dark text-white/60 py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 text-center flex flex-col items-center gap-6">
          <div className="flex items-center gap-3 opacity-80 hover:opacity-100 transition-opacity">
            <img src={logoUrl} alt="Plot Ark Logo" className="h-8 w-8 object-contain" />
            <span className="font-serif font-bold text-xl text-white tracking-tight">Plot Ark</span>
          </div>
          <p>
            An open-source curriculum engine. Released under AGPL v3.0.<br/>
            Engineered with ❤️ for the future of education.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
