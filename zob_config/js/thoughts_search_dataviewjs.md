---
title: thoughts_search_dataviewjs
tags: 
categories: 
date: 2024-12-09T02:00:29+08:00
modify: 2024-12-09T02:00:29+08:00
dir: dairy
share: true
cdate: 2024-12-09
mdate: 2024-12-09
---

# thoughts_search_dataviewjs

```dataviewj
// Core implementation class for handling Obsidian file processing and rendering
class P2C {
  constructor(app, ob) {
    this.app = app;
    this.ob = ob;
    this.sugar = {
      getFBP: path => app.vault.getAbstractFileByPath(path),
      getFC: file => app.metadataCache.getFileCache(file),
      getFLD: (str, rPath) => app.metadataCache.getFirstLinkpathDest(str, rPath)?.path
    };
    this.rg1 = /!\[(?!\[).*?\]\((?!<?http:|<?https:|<?file:)(.+?\.[a-zA-Z]{3,4})\>?\)|!\[\[(.+?\.[a-zA-Z]{3,4})\|?.*?\]\]/g;
    this.rg2 = /!\[(?!\[).*?\]\(\<?.+?\.[a-zA-Z]{3,4}\>?\)|!\[\[.+?\.[a-zA-Z]{3,4}\|?.*?\]\]/g;
  }

  // Helper methods for file processing
  exFuc(str) {
    return Array.from(str.matchAll(this.rg1), p => p[1] || p[2])?.[0];
  }

  P2C(p, arr, only) {
    const { getFLD } = this.sugar;
    const { exFuc, rg1, rg2 } = this;
    const B = p.file.outlinks.filter(p => p.embed && !/\.md$/.test(p.path));
    
    const flag = (str, a) => {
      B.map(b => {
        const dis = /\|?(\d+)]/.exec(str);
        const src = this.app.vault.adapter.getResourcePath(b.path);
        if (getFLD(exFuc(str), p.file.path) == b.path) {
          a = a.replace(str, `![|${dis?.[1] || ''}](<${src}>)`);
        }
      });
      return a;
    };

    let r = [];
    arr.map(i => {
      const locs = i.match(rg1);
      const pics = i.match(rg2);
      const inps = only ? pics : [i];
      inps ? inps.map(inp => {
        locs && locs.map(loc => inp = flag(loc, inp));
        r.push(inp);
      }) : r.push(false);
    });
    return r;
  }

  async genUser(p) {
    const { getFC, getFBP } = this.sugar;
    const file = getFBP(p.file.path);
    const fc = getFC(file);
    const A = (await this.app.vault.read(file)).split('\n');
    return {
      file,
      fc,
      frp: fc.frontmatterPosition,
      A: this.P2C(p, A),
      pics: this.P2C(p, A, true).filter(p => p),
    };
  }

  async mRender(str, p) {
    const el = Object.assign(document.createElement('div'), { id: 'raw' });
    await this.ob.MarkdownRenderer.render(this.app, str, el, p.file.path);
    return el;
  }
}

// Main execution
(async () => {
  // Configuration
  const tars = {
    'THOUGHTS': 2,  // Collect level 2 Thoughts heading
  };
  
  const showHead = false;
  const scale = 0.8;
  
  // Initialize processor
  const processor = new P2C(dv.app, obsidian);
  
  // Get files matching the pattern
  const files = dv.pages('"dairy"')
    .filter(p => {
      const dailyMatch = p.file.name.match(/^(\d{4})-(\d{1,2})-(\d{2})-(\d{2})-(\d{1})$/);
      const weeklyMatch = p.file.name.match(/^(\d{4})-W(\d{1,2})-(\d{2})$/);
      return dailyMatch || weeklyMatch;
    })
    .sort(p => {
      let date;
      const dailyMatch = p.file.name.match(/^(\d{4})-(\d{1,2})-(\d{2})-(\d{2})-(\d{1})$/);
      if (dailyMatch) {
        const [_, year, week, month, day] = dailyMatch;
        date = moment(`${year}-${month}-${day}`, 'YYYY-MM-DD');
      } else {
        const weeklyMatch = p.file.name.match(/^(\d{4})-W(\d{1,2})-(\d{2})$/);
        const [_, year, week, day] = weeklyMatch;
        date = moment(`${year}-${day}`, 'YYYY-DD').week(week);
      }
      return date.valueOf();
    }, 'desc');

  // Process content for each file
  const getPerData = async (p) => {
    const user = await processor.genUser(p);
    const raws = [];
    
    const headings = () => {
      const { fc, A } = user;
      for (const [heading, level] of Object.entries(tars)) {
        try {
          const heads = fc.headings;
          if (!heads) return;
          const i = heads.findIndex(p => p.heading == heading && (p.level == level || level > 6));
          let j = i + 1;
          while (heads[j]?.level > level) j++;
          let pos = heads[i].position.end.line;
          if (!showHead) pos += 1;
          raws.push((heads[j] ? A.slice(pos, heads[j].position.end.line) : A.slice(pos)).join('\n'));
        } catch (e) {
          raws.push(`\n~~无${heading}~~\n`);
        }
      }
    };

    headings();
    return raws[0] ? [p, raws] : false;
  };

  // Render results using dv.paragraph
  const pages = (await Promise.all(files.map(getPerData))).filter(p => p);
  pages.map(([p, li]) => {
    const type = p.file.name.includes('-W') ? '周记' : '日记';
    const date = p.file.name.includes('-W')
      ? p.file.name.match(/^(\d{4})-W(\d{1,2})-(\d{2})$/)[0]
      : p.file.name.split('-').slice(0, 3).join('-');
    dv.paragraph(`### ${date} (${type}) [[${p.file.path}|${p.file.name}]]\n${li}`);
  });

  // Add style observer for rendering
  const SF = (el, strs) => strs.map(str => {
    const ori = window.getComputedStyle(el).getPropertyValue(str);
    const unit = ori.match(/[a-z]+/);
    const value = ori.replace(unit, '');
    return `${str}:${value * scale}${unit}`;
  }).join(';');

  const ober = new MutationObserver((muts, ober) => {
    if (!dv.container.querySelector('#raw')) return;
    dv.container.querySelectorAll('#raw').forEach(el => {
      el.style.cssText = SF(el, ['font-size', '--p-spacing']);
      el.querySelectorAll('img').forEach(img => img.style.cssText = SF(img, ['width']));
    });
    ober.disconnect();
  });
  
  ober.observe(dv.container, { childList: true, subtree: true });
})();
```
