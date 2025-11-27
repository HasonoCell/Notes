<%*
    let updateData = tp.file.last_modified_date("YYYY-MM-DDTHH:mm:ss+08:00");
    let newContent = tp.file.content.replace(/(modify:)([\s,\d,-,:+]+)(.*)/, "modify: " + updateData);
	let updateData2 = tp.file.last_modified_date("YYYY-MM-DD");
    let newContent2 = tp.file.content.replace(/(mdate:)([\s,\d,-,:+]+)(.*)/, "mdate: " + updateData2);
    let file = this.app.workspace.activeLeaf.view.file;
    this.app.vault.modify(file, newContent);
    this.app.vault.modify(file, newContent2);  
%>
