const { files, obsidian, showHead, tars, kwd, tb, li, mline } = input
, import_P2C = (app, ob)=> class {
  sugar = new class {
    getFBP = path=> app.vault.getAbstractFileByPath(path); getFC = file=> app.metadataCache.getFileCache(file)
    getFLD = (str, rPath)=> app.metadataCache.getFirstLinkpathDest(str, rPath)?.path
  }
  rg1 = /!\[(?!\[).*?\]\((?!<?http:|<?https:|<?file:)(.+?\.[a-zA-Z]{3,4})\>?\)|!\[\[(.+?\.[a-zA-Z]{3,4})\|?.*?\]\]/g
  rg2 = /!\[(?!\[).*?\]\(\<?.+?\.[a-zA-Z]{3,4}\>?\)|!\[\[.+?\.[a-zA-Z]{3,4}\|?.*?\]\]/g
  exFuc = str=> Array.from(str.matchAll(this.rg1), p=> p[1]||p[2])?.[0]
  P2C = (p, arr, only)=> {
    const { getFLD } = this.sugar, { exFuc, rg1, rg2 } = this
    , B = p.file.outlinks.filter(p=> p.embed && !/\.md$/.test(p.path))
    , flag = (str, a)=> { B.map(b=> {
      const dis = /\|?(\d+)]/.exec(str), src = app.vault.adapter.getResourcePath(b.path)
      if (getFLD(exFuc(str), p.file.path) == b.path) a = a.replace(str, `![|${dis?.[1]||''}](<${src}>)`)
    }); return a }
    let r = []
    arr.map(i=> {
      const locs = i.match(rg1), pics = i.match(rg2), inps = only ? pics : [i]
      inps ? inps.map(inp=> { locs && locs.map(loc=> inp = flag(loc, inp)); r.push(inp) }) : r.push(!1)
    }); return r
  }
  genUser = async (p)=> {
    const { getFC, getFBP } = this.sugar
    , file = getFBP(p.file.path), fc = getFC(file), A = (await app.vault.read(file)).split('\n')
    return {
      file, fc, frp: fc.frontmatterPosition, A: this.P2C(p, A), pics: this.P2C(p, A, !0).filter(p=> p),
    }
  }
  mRender = async (str, p)=> {
    const el = Object.assign(document.createElement('div'), {id: 'raw'})
    await ob.MarkdownRenderer.render(app, str, el, p.file.path); return el
  }
}
, { genUser, mRender } = new (import_P2C(dv.app, obsidian))

, getPerData = async p=> {
  const user = await genUser(p), raws = []
  , headings = ()=> {
    const { fc, A } = user
    for (const tar of Object.entries(tars)) {
      try {
        const heads = fc.headings; if (!heads) return
        const i = heads.findIndex(p=> p.heading == tar[0] && (p.level == tar[1] || tar[1] > 6))
        let j = i+1; while (heads[j]?.level > tar[1]) j++
        let pos = heads[i].position.end.line; if (!showHead) pos += 1
        raws.push(( heads[j] ? A.slice(pos, heads[j].position.end.line) : A.slice(pos) ).join('\n'))
      } catch (e) { raws.push(`\n~~无${tar[0]}~~\n`) }
    }
  }
  , fulltext = ()=> {
    const { frp, A } = user
    if (frp) A.splice(frp.start.line, frp.end.line-frp.start.line+1); raws.push(A.join('\n'))
  }
  tars ? headings() : fulltext(); return (raws[0]||kwd) ? [p, raws] : !1
}

/*https://forum-zh.obsidian.md/t/topic/32288/1*/
, SF = (el, strs)=> strs.map(str=> {
  const { scale } = input, ori = window.getComputedStyle(el).getPropertyValue(str)
  , unit = ori.match(/[a-z]+/), value = ori.replace(unit, ''); return `${str}:${value*(scale||0.5)}${unit}`
}).join(';')
, ober = new MutationObserver((muts, ober)=> {
  if (!dv.container.querySelector('#raw')) return
  dv.container.querySelectorAll('#raw').forEach(el=> {
    el.style.cssText = SF(el, ['font-size', '--p-spacing'])
    el.querySelectorAll('img').forEach(img=> img.style.cssText = SF(img, ['width']))
  }); ober.disconnect()
}); ober.observe(dv.container, { childList: !0, subtree: !0 })

/*https://forum-zh.obsidian.md/t/topic/29178/1*/
, signage = async (p)=> {
  const { file, frp, A, pics } = await genUser(p)
  , A1 = frp ? A.slice(frp.end.line+1, frp.end.line+1+mline) : A.slice(0, mline)
  , mbody = await mRender(pics[0]||A1.join('\n'), p)
  mbody.onclick = evt=> {
    const leaf = evt.ctrlKey ? app.workspace.getLeaf('tab') : app.workspace.getMostRecentLeaf()
    leaf.openFile(file)
  }; return [p.file.link, mbody]
}
, gallery = ()=> Promise.all(files.map(signage)).then(data=> dv.table(['文档', '预览'], data))

if (mline) gallery(); else {
  const pages = (await Promise.all(files.map(getPerData))).filter(p=> p)
  if (li) pages.map(li);
  else {
    const thead = Object.keys(tb).concat(tars ? Object.keys(tars) : ['全文'])
    Promise.all(pages.map(p=>
      Promise.all(p[1].map(async raw=> await mRender(raw, p[0]))).then(
        raws=> Object.values(tb).map(func=> func(p[0])).concat(raws)
      )
    )).then(tdata=> dv.table(thead, tdata))
  }
}