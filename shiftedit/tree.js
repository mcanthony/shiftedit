define(['resumable', "jstreegrid","app/util","app/editors","app/prompt",'app/lang','app/tabs','app/loading', 'app/site'], function (Resumable) {
var util = require('app/util');
var editor = require('app/editors');
var lang = require('app/lang').lang;
var prompt = require('app/prompt');
var tabs = require('app/tabs');
var loading = require('app/loading');
var site = require('app/site');
var options = {};
var tree;
var confirmed = false;
var r;
var uploadStarted =false;

var reference;
var inst;

//given a path will select the file
function select(path) {
	var inst = $.jstree.reference($('#tree'));
    var node;
    var dirPath = '';
    var parts = (path).split('/');
    var i = 0;

    function expandPath() {
        for (; i<parts.length; ) {
            if(dirPath)
                dirPath += '/';

            dirPath += parts[i];
            node = inst.get_node(dirPath);

            if(node){
                i++;
                if(!node.state.opened){
                    return inst.open_node(node, expandPath, false);
                }
            }else{
                //can't find it
                return false;
            }
        }

        //found it
        inst.deselect_all();
        inst.select_node(node);
    }

    expandPath();
}

function newFolder(data) {
    //data.item.name

	var inst = $.jstree.reference(data.reference),
		obj = inst.get_node(data.reference);
		var parent = obj.type == 'default' ? obj : inst.get_node(obj.parent);
	inst.create_node(parent, { type : "default" }, "last", function (new_node) {
		setTimeout(function () { inst.edit(new_node); }, 0);
	});
}

function newFile(data) {
	var inst = $.jstree.reference(data.reference),
		obj = inst.get_node(data.reference);
	var parent = obj.type == 'default' ? obj : inst.get_node(obj.parent);

    var extension = data.item.extension;
    var newName = data.item.name ? data.item.name : 'untitled';

	var i = 0;
	while( parent.children.indexOf(newName) !== -1 ){
		i++;
		newName = newName + i + '.' + extension;
	}
	inst.create_node(parent, { type : "file", text: 'untitled.'+extension }, "last", function (new_node) {
		setTimeout(function () { inst.edit(new_node); }, 0);
	});
}

function extract(data) {
    var node = getSelected()[0];
	var file = node.id;

	if(!file){
	    return false;
	}

	//remote extract
	var abortFunction = function(){
		if( source ){
			source.close();
		}
	};

	var url = options.url;
	if( url.indexOf('?')==-1 ){
		url+='?';
	}else{
		url+='&';
	}
	url += 'cmd=extract&site='+options.site+'&file='+file;

	loading.start('Extracting ' + file, abortFunction);
	var source = new EventSource(url, {withCredentials: true});

	var count = 0;
	var total = 0;

	source.addEventListener('message', function(event) {
		var data = JSON.parse(event.data);

		if( count === 0 ){
			total = data.msg;
		}else{
			loading.stop(false);
			loading.start('Extracting ' + data.msg+' ['+count+'/'+total+']', abortFunction);
		}

		count ++;
	}, false);

	source.addEventListener('error', function(event) {
		if (event.eventPhase == 2) { //EventSource.CLOSED
			if( source ){
				source.close();
			}

			loading.stop();
			refresh();
		}
	}, false);

}

function downloadZip(data) {
	var inst = $.jstree.reference(data.reference),
		node = inst.get_node(data.reference);

	var file = node.id;

	//send compress request
	var abortFunction = function(){
		if( source ){
			source.close();
		}
	};
	loading.start('Compressing ' + file, abortFunction);

	var url = options.url;
	if( url.indexOf('?')==-1 ){
		url+='?';
	}else{
		url+='&';
	}
	url += 'cmd=compress&site='+options.site+'&file='+file;

	var source = new EventSource(url, {withCredentials: true});

	source.addEventListener('message', function(event) {
		var data = JSON.parse(event.data);

		if( data.msg === 'done' ){
			done = true;
			loading.stop(false);

			source.close();

    		var evt = document.createEvent("HTMLEvents");
    		evt.initEvent("click");

    		var a = document.createElement('a');
    		a.download = 1;
			a.href = url+'&d=1';
    		a.dispatchEvent(evt);
		}else{
			loading.stop(false);
			loading.start(data.msg, abortFunction);
		}
	}, false);

	source.addEventListener('error', function(event) {
		//console.log(event);
		if (event.eventPhase == 2) { //EventSource.CLOSED
			if( source ){
				source.close();
			}
		}
	}, false);
}

function downloadFile(data) {
	var inst = $.jstree.reference(data.reference),
		node = inst.get_node(data.reference);

	var file = node.id;

    loading.fetch(options.url+'&cmd=download&file='+file, {
        action: 'downloading file',
        success: function(data) {
            var blob = util.b64toBlob(data.content);
    		var evt = document.createEvent("HTMLEvents");
    		evt.initEvent("click");

    		var a = document.createElement('a');
    		a.download = util.basename(file);
    		a.href = URL.createObjectURL(blob);
    		a.dispatchEvent(evt);
        }
    });
}

function upload() {
	var evt = document.createEvent("HTMLEvents");
	evt.initEvent("click");

	var a = document.createElement('a');
    r.assignBrowse(a);
	a.href = '#';
	a.dispatchEvent(evt);
}

var uploadFolders = [];
var uploadFiles = [];

function processUploads() {
    if (uploadFolders.length) {
        var folder = uploadFolders.shift();

        //check exists
        loading.stop();
        loading.fetch(options.url+'&cmd=file_exists&file='+folder, {
            action: 'Checking '+folder,
            success: function(data) {
                if(data.file_exists===false) {
                    loading.stop();
                    loading.fetch(options.url+'&cmd=newdir&dir='+folder, {
                        action: 'Uploading '+folder,
                        success: function(data) {
                            processUploads();
                        }
                    });
                }else{
                    processUploads();
                }
            }
        });
    } else if(uploadFiles.length) {
        var file = uploadFiles.shift();

        loading.stop();
        loading.fetch(options.url+'&cmd=upload', {
            action: 'uploading '+file.path,
            data: {
                file: file.path,
                content: file.content
            },
            success: function(data) {
                processUploads();
            }
        });
    } else {
        //done!
        loading.stop();
        refresh();
    }
}

function uploadFolder() {
	//var evt = document.createEvent("HTMLEvents");
	//evt.initEvent("click");

	$('<input type="file" multiple directory webkitdirectory mozdirectory>').change(function(e) {
		//loading maask
		var node = getSelected();
		var parent = getDir(node);
		var path = parent.id;
		var files = e.target.files;

        for (var i = 0, f; f = files[i]; ++i) {
        	// if folder, check exists
        	var dir = util.dirname(f.webkitRelativePath);
        	var dirParts = dir.split('/');
        	var subfolder = '';
        	dirParts.forEach(function(part) {
        	    subfolder += part;

            	if(uploadFolders.indexOf(subfolder)==-1){
            	    uploadFolders.push(subfolder);
            	}

        	    subfolder += '/';
        	});

        	uploadFiles[i] = {path: f.webkitRelativePath};

			var reader = new FileReader();
			reader.onloadend = function (file, i) {
				return function () {
					uploadFiles[i].content = this.result;
				};
			}(f, i);

			if (f.type.match('text.*')) {
				reader.readAsText(f);
			} else {
				reader.readAsDataURL(f);
			}
        }

        processUploads();
	}).click();
	//a.dispatchEvent(evt);
}

function loadUploadUrls() {
    return $.getJSON('/api/uploadurls')
        .then(function (data) {
            var urls = data.urls;

            $( "#uploadUrl" ).children('option').remove();
            $.each(urls, function( index, item ) {
                $( "#uploadUrl" ).append( '<option value="' + item.value + '">'+item.label+'</option>' );
            });

            return urls;
        });
}

function checkExtract(option) {
    var val = option.value;
    var isZip = ['zip', 'bz2', 'tar', 'gz', 'ar'].indexOf(util.fileExtension(val)) !== -1;

	$('#uploadUrlForm [name=extract]').prop('disabled', !isZip);
}

function uploadByURl() {
    //dialog
    $( "body" ).append('<div id="dialog-uploadUrl" class="ui-front" title="Upload by url">\
      <form id="uploadUrlForm">\
        <fieldset>\
            <p>\
                <label>URL:</label>\
                <select id="uploadUrl" name="url"></select>\
                <button type="button" class="delete">X</button>\
            </p>\
            <p>\
                <label><input type="checkbox" name="extract" value="1" disabled> extract archive</label>\
            </p>\
        </fieldset>\
      </form>\
    </div>');

    //profile combo
    var combo = $( "#uploadUrl" ).combobox({
        select: function (event, ui) {
            checkExtract(ui.item);
        },
        change: function (event, ui) {
            checkExtract(ui.item);
        }
    });
    loadUploadUrls();

    $('#uploadUrlForm .delete').click(function() {
        var url = combo.combobox('val');

        if(!url)
            return;

        loading.fetch('/api/uploadurls?cmd=delete', {
            data: {url: url},
            action: 'Deleting upload url',
            success: function(data) {
                combo.combobox('val', '');
                loadUploadUrls();
            }
        });
    });

    //open dialog
    var dialog = $( "#dialog-uploadUrl" ).dialog({
        modal: true,
        width: 550,
        height: 300,
        buttons: {
            OK: function() {
				var url = combo.combobox('val');

				if( !url ){
					combo.combobox('focus');
					return;
				}

                var extractFile = $('[name=extract]').prop('checked');
        		var node = getSelected();
        		var parent = getDir(node);
        		var path = parent.id;

                loading.fetch(options.url+'&cmd=uploadByURL', {
                    data: {
                        url: url,
                        path: path
                    },
                    action: 'uploading '+url,
                    success: function(data) {
                        //add node if it doesn't exist
                        var node = tree.jstree(true).get_node(data.file);
                        var parent = getDir(node);

                        if(!node) {
                            node = tree.jstree('create_node', parent, {'id' : path, 'text' : util.basename(data.file)}, 'last');
                        }

                        //select node
                        tree.jstree(true).deselect_all();
                        tree.jstree(true).select_node(node);

                        //extract?
                        if(extractFile) {
                            extract({reference: node});
                        }

        				//save url
        				/*
                        loading.fetch('/api/uploadurls', {
                            data: {url: url},
                            action: 'saving url '+url
                        });
                        */
                    },
                    context: this
                });

				$( this ).dialog( "close" );
            }
        }
    });
}

function open(data) {
	var inst = $.jstree.reference(data.reference);
    var selected = inst.get_selected();
    var node = inst.get_node(data.reference);

    if(node.icon==="folder") {
        return;
    }

	if(selected && selected.length) {
	    var file = selected.join(':');
	    tabs.open(file, options.site);
	}
}

function openTab(data) {
	var inst = $.jstree.reference(data.reference);
    var selected = inst.get_selected();
    var node = inst.get_node(data.reference);

    if(node.icon==="folder") {
        return;
    }

    var settings = site.getSettings(options.site);
	window.open('//' + location.host + location.pathname + '#' + settings.name + '/' + node.id);
}

function chmod(data) {
	var inst = $.jstree.reference(data.reference);
    var selected = inst.get_selected();
    var node = inst.get_node(data.reference);

    //dialog
    $( "body" ).append('<div id="dialog-chmod" class="ui-front" title="File permissions">\
      <form id="chmodForm">\
        <fieldset>\
            <legend>Owner</legend>\
            <p>\
                <input type="checkbox" name="owner-read" id="owner-read">\
                <label for="owner-read">Read</label>\
                <input type="checkbox" name="owner-write" id="owner-write">\
                <label for="owner-write">Write</label>\
                <input type="checkbox" name="owner-execute" id="owner-execute">\
                <label for="owner-execute">Execute</label>\
            </p>\
        </fieldset>\
        <fieldset>\
            <legend>Group</legend>\
            <p>\
                <input type="checkbox" name="group-read" id="group-read">\
                <label for="group-read">Read</label>\
                <input type="checkbox" name="group-write" id="group-write">\
                <label for="group-write">Write</label>\
                <input type="checkbox" name="group-execute" id="group-execute">\
                <label for="group-execute">Execute</label>\
            </p>\
        </fieldset>\
        <fieldset>\
            <legend>Public</legend>\
            <p>\
                <input type="checkbox" name="public-read" id="public-read">\
                <label for="public-read">Read</label>\
                <input type="checkbox" name="public-write" id="public-write">\
                <label for="public-write">Write</label>\
                <input type="checkbox" name="public-execute" id="public-execute">\
                <label for="public-execute">Execute</label>\
            </p>\
        </fieldset>\
        <p>\
            <label>Numeric value</label> <input type="text" id="chmod-value" name="chmod-value">\
        </p>\
      </form>\
    </div>');

    //$( "#chmodForm input[type=checkbox]" ).button();

    $('#chmod-value').on('keyup change', function() {
		var perms = $('#chmod-value').val();
		var owner = perms.substr(0, 1);
		var group = perms.substr(1, 1);
		var pub = perms.substr(2, 1);

        $('#owner-read').prop('checked', (owner >= 4 && owner <= 7));
        $('#owner-write').prop('checked', (owner == 2 || owner == 3 || owner == 6 || owner == 7));
        $('#owner-execute').prop('checked', (owner == 1 || owner == 3 || owner == 5 || owner == 7));
        $('#group-read').prop('checked', (group >= 4 && group <= 7));
        $('#group-write').prop('checked', (group == 2 || group == 3 || group == 6 || group == 7));
        $('#group-execute').prop('checked', (group == 1 || group == 3 || group == 5 || group == 7));
        $('#public-read').prop('checked', (pub >= 4 && pub <= 7));
        $('#public-write').prop('checked', (pub == 2 || pub == 3 || pub == 6 || pub == 7));
        $('#public-execute').prop('checked', (pub == 1 || pub == 3 || pub == 5 || pub == 7));
    });

    $( "#chmodForm input[type=checkbox]" ).on('click change', function(){
		var owner = 0, pub = 0, group = 0;

		if ($('#owner-read').prop('checked'))
			owner += 4;
		if ($('#owner-write').prop('checked'))
			owner += 2;
		if ($('#owner-execute').prop('checked'))
			owner += 1;

		if ($('#group-read').prop('checked'))
			group += 4;
		if ($('#group-write').prop('checked'))
			group += 2;
		if ($('#group-execute').prop('checked'))
			group += 1;

		if ($('#public-read').prop('checked'))
			pub += 4;
		if ($('#public-write').prop('checked'))
			pub += 2;
		if ($('#public-execute').prop('checked'))
			pub += 1;

		$('#chmod-value').val(owner + '' + group + '' + pub);
    });

    $('#chmod-value').val(node.data.perms).change();

    //open dialog
    var dialog = $( "#dialog-chmod" ).dialog({
        modal: true,
        width: 400,
        height: 350,
        buttons: {
            OK: function() {
                var node = getSelected()[0];
                var mode = $('#chmod-value').val();

                loading.fetch(options.url+'&cmd=chmod&file='+node.id+'&mode='+mode, {
                    action: 'chmod file',
                    success: function(data) {
                        node.data.perms = mode;
                        var el = inst.get_node(node, true);
                        el.trigger("change_node.jstree"); //FIXME supposed to update column

				        $( "#dialog-chmod" ).dialog( "close" );
                    }
                });
            }
        }
    });

}

function getSelected() {
    var reference = $('#tree');
    var inst = $.jstree.reference(reference);
    return inst.get_selected(true);
}

function getDir(node) {
    var reference = $('#tree');
    var inst = $.jstree.reference(reference);
    var parent = node.type == 'default' ? node : inst.get_node(node.parent);
    return parent;
}

function init() {
    var chunkedUploads = false;
    r = new Resumable({
        //target: _this.url,
        testChunks: false,
        query: {
            cmd: 'upload',
            chunked: 1,
            //path: _this.getPath(_this.node)
        },
        withCredentials: true,
        //node: _this.node
    });

    r.assignDrop($('#tree'));

    $('#tree').on('dragenter', 'a', function(e) {
        var inst = $.jstree.reference(this);
        inst.deselect_all();
        var node = inst.select_node(this);
    });

    $('#tree').on('dragleave', function(e) {
    });

    $('#tree').on('dragover', function(e) {
        e.preventDefault();
    });

    r.on('fileProgress', function(file){
		if (uploadStarted) {
		    //console.log(r.progress());
			var msg = 'Uploading '+file.fileName;
			var perc = parseInt(r.progress() * 100);

			loading.stop(false);

			if( perc == 100 ){
				loading.start(msg+' [deploying..]');
			}else{
				loading.start(msg+' ['+perc+'%]', function(){
				    r.cancel();
				});
			}
		}
	});

    r.on('complete', function(){
        uploadStarted = false;
		loading.stop();

		//clear upload queue so you can upload the same file
		r.cancel();

		//_this.setUrl(_this.url);
        refresh();
	});

    r.on('error', function(message, file){
		loading.stop();
		prompt.alert({title:file, msg:message});
	});

    r.on('fileAdded', function(file){
        uploadStarted = true;

        if( chunkedUploads ){
            r.opts.chunkSize = 1*1024*1024;
        }else{
            r.opts.chunkSize = 20*1024*1024;
        }

        r.opts.target = options.url+'&cmd=upload';
        r.opts.withCredentials = true;

        var node = getSelected()[0];
        var parent = getDir(node);

        r.opts.query = {
            //cmd: 'upload',
            chunked: 1,
            path: node.id
        };

        r.upload();
    });

    tree = $('#tree')
    .jstree({
    	'core' : {
    	    /*
    		'data' : {
    			'url' : '',
    			'data' : function (node) {
    				return { 'id' : node.id };
    			}
    		},*/
            'data' : function (node, callback) {
                //console.log(node);

                if(!options.url){
                    return false;
                }

        		$.ajax(options.url+'&cmd=list&path='+encodeURIComponent(node.id), {
        		    method: 'POST',
        		    dataType: 'json',
        		    data: options.params,
        		    success: function(data) {
        		        //console.log(data);
                        callback.call(tree, data.files);
        		    }
        		});
            },
    		'check_callback' : function(o, n, p, i, m) {
            	var t = this;

    			if(m && m.dnd && m.pos !== 'i') { return false; }
    			if(o === "move_node" || o === "copy_node") {
    				if(this.get_node(n).parent === this.get_node(p).id) { return false; }
    			}

    			if(o === "delete_node") {
                	if (!confirmed){
                    	prompt.confirm({
                    	    title: 'Delete',
                    	    msg: 'Are you sure you want to delete the selected files?',
                    	    fn: function(btn) {
                    	        switch(btn){
                    	            case 'yes':
                    	                //console.log(o, n, p, i, m);
                    	                confirmed = true;
                    	                t.delete_node(n);
                    	            break;
                    	        }
                    	    }
                    	});
        			    return false;
                	}else{
                	    confirmed = false;
                	    return true;
                	}

    			    //return confirm("Are you sure you want to delete the selected files?");
    			}

    			return true;
    		},
    		'force_text' : true,
    		'themes' : {
    			'responsive' : false,
    			'variant' : 'small',
    			'stripes' : true
    		}
    	},
    	'sort' : function(a, b) {
    		return this.get_type(a) === this.get_type(b) ? (this.get_text(a).toLowerCase() > this.get_text(b).toLowerCase() ? 1 : -1) : (this.get_type(a) >= this.get_type(b) ? 1 : -1);
    	},
    	'contextmenu' : {
    		'items' : function(node) {
    			//var tmp = $.jstree.defaults.contextmenu.items();

    			var tmp = {
    			    "create": {
                        "label": "New",
                        "submenu": {
							"create_folder" : {
								"separator_after"	: true,
								"label"				: "Folder",
								"action"			: newFolder
							},
							"create_html" : {
								"label"				: "HTML file",
								"action"			: newFile,
								"extension": 'html'
							},
							"create_php" : {
								"label"				: "PHP file",
								"action"			: newFile,
								"extension": 'php'
							},
							"create_css" : {
								"label"				: "CSS file",
								"action"			: newFile,
								"extension": 'css'
							},
							"create_js" : {
								"label"				: "JS file",
								"action"			: newFile,
								"extension": 'js'
							},
							"create_json" : {
								"label"				: "JSON file",
								"action"			: newFile,
								"extension": 'json'
							},
							"create_htaccess" : {
								"label"				: "Htaccess file",
								"action"			: newFile,
								"extension": 'htaccess',
								"name": ''
							},
							"create_ruby" : {
								"label"				: "Ruby file",
								"action"			: newFile,
								"extension": 'rb'
							},
							"create_python" : {
								"label"				: "Python file",
								"action"			: newFile,
								"extension": 'py'
							},
							"create_perl" : {
								"label"				: "Perl file",
								"action"			: newFile,
								"extension": 'pl'
							},
							"create_text" : {
								"label"				: "Text file",
								"action"			: newFile,
								"extension": 'txt'
							},
							"create_xml" : {
								"label"				: "XML file",
								"action"			: newFile,
								"extension": 'xml'
							}
						}
    			    },
    			    "open": {
                        "label": "Open",
                        "submenu": {
							"open" : {
								"label": "Open",
								action: open
							},
							"open_tab" : {
								"label": "Open in new browser tab",
								action: openTab
							},
							"download" : {
								"label": "Download",
								action: downloadFile
							},
                        }
    			    },
                    "ccp": {
                        "separator_before": true,
                        "icon": false,
                        "separator_after": true,
                        "label": "Edit",
                        "action": false,
                        "submenu": {
                            "cut": {
                                "separator_before": false,
                                "separator_after": false,
                                "label": "Cut",
    							"action"			: function (data) {
    								var inst = $.jstree.reference(data.reference),
    									obj = inst.get_node(data.reference);
    								if(inst.is_selected(obj)) {
    									inst.cut(inst.get_top_selected());
    								}
    								else {
    									inst.cut(obj);
    								}
    							}
                            },
                            "copy": {
                                "separator_before": false,
                                "icon": false,
                                "separator_after": false,
                                "label": "Copy",
                                "shortcut": 67,
                                "shortcut_label": "C",
    							"action"			: function (data) {
    								var inst = $.jstree.reference(data.reference),
    									obj = inst.get_node(data.reference);
    								if(inst.is_selected(obj)) {
    									inst.copy(inst.get_top_selected());
    								}
    								else {
    									inst.copy(obj);
    								}
    							}
                            },
                            "paste": {
                                "separator_before": false,
                                "icon": false,
    							"_disabled"			: function (data) {
    								return !$.jstree.reference(data.reference).can_paste();
    							},
                                "separator_after": false,
                                "label": "Paste",
    							"action"			: function (data) {
    								var inst = $.jstree.reference(data.reference),
    									obj = inst.get_node(data.reference);
    								inst.paste(obj);
    							}
                            },
                            "rename": {
                                "separator_before": false,
                                "separator_after": false,
                                "_disabled": false,
                                "label": "Rename",
            					"shortcut"			: 113,
            					"shortcut_label"	: 'F2',
            					"icon"				: "glyphicon glyphicon-leaf",
            					"action"			: function (data) {
            						var inst = $.jstree.reference(data.reference),
            							obj = inst.get_node(data.reference);
            						inst.edit(obj);
            					}
                            },
                            "remove": {
                                "separator_before": false,
                                "icon": false,
                                "separator_after": false,
                                "_disabled": false,
                                "label": "Delete",
                                "shortcut": 46,
                                "shortcut_label": "Del",
            					"action"			: function (data) {
            						var inst = $.jstree.reference(data.reference),
            							obj = inst.get_node(data.reference);
            						if(inst.is_selected(obj)) {
            							inst.delete_node(inst.get_selected());
            						}
            						else {
            							inst.delete_node(obj);
            						}
            					}
                            },
                            "duplicate": {
                                "separator_before": false,
                                "icon": false,
    							"_disabled": function (data) {
    								return !$.jstree.reference(data.reference).can_paste();
    							},
                                "separator_after": false,
                                "label": "Paste",
    							"action": function (data) {
    								var inst = $.jstree.reference(data.reference),
    									obj = inst.get_node(data.reference);
    								inst.paste(obj);
    							}
                            }
                        }
                    },
                    "upload": {
                        "separator_before": true,
                        "icon": false,
                        "separator_after": true,
                        "label": "Upload",
                        "action": false,
                        "submenu": {
        					"upload" : {
        						"label": "File",
        						//icon: 'upload',
        						action: upload
        					},
        					"upload_folder" : {
        						"label": "Folder",
        						action: uploadFolder
        					},
        					"upload_url" : {
        						"label": "URL",
        						action: uploadByURl
        					}
                        }
                    },
					"extract": {
						"label": "Extract",
						"_disabled": function (data) {
							var inst = $.jstree.reference(data.reference),
								node = inst.get_node(data.reference);

							if( ['zip', 'bz2', 'tar', 'gz', 'ar'].indexOf(util.fileExtension(node.id)) !== -1 ){
							    return false;
							}else{
							    return true;
							}
						},
						action: extract
					},
					"downloadzip": {
						"label": "Download as zip",
						action: downloadZip
					},
					"reload": {
						"label" : "Reload",
						action: refresh
					},
					"chmod": {
						"label": "Set permissions",
                        "separator_after": true,
                        action: chmod
					}
                };

    			return tmp;
    		}
    	},
    	'types' : {
    		'default' : { 'icon' : 'folder' },
    		'file' : { 'valid_children' : [], 'icon' : 'file' }
    	},
    	'unique' : {
    		'duplicate' : function (name, counter) {
    			return name + ' ' + counter;
    		}
    	},
        grid: {
            resizable: true,
            columns: [
                {width: 50, header: "Name"},
                {
                    width: 30,
                    header: "Modified",
                    value: "modified",
                    format: function(v) {
        				if( v === '' ){
        					return '';
        				}

        				return new Date(v*1000).toLocaleString();
        			}
                },
                {
                    width: 30,
                    header: "Size",
                    value: "size",
                    format: function(size) {
        				if( size === '' ){
        					return '';
        				}

        				var si;
        				for( si = 0; size >= 1024; size /= 1024, si++ );

        				return ''+Math.round(size)+'BKMGT'.substr(si, 1);
        			}
                },
                {width: 30, header: "Permissions", value: "perms"}
            ]
        },
    	'plugins' : [
    	    'state','dnd','sort','types','contextmenu','unique'//,'grid'
    	]
    })
    .on('delete_node.jstree', function (e, data) {
        /*
    	$.get('?operation=delete_node', { 'id' : data.node.id })
    		.fail(function () {
    			data.instance.refresh();
    		});*/

		$.ajax(options.url+'&cmd=delete&file='+data.node.id, {
		    method: 'POST',
		    dataType: 'json',
		    data: options.params,
		    /*
		    data: options.params,
		    success: function(data) {
                callback.call(tree, data);
		    }
		    */
		})
		.fail(function () {
			data.instance.refresh();
		});
    })
    .on('create_node.jstree', function (e, data) {
    	$.get(options.url+'&cmd=newfile', { 'type' : data.node.type, 'id' : data.node.parent, 'text' : data.node.text })
    		.done(function (d) {
    			data.instance.set_id(data.node, d.id);
    		})
    		.fail(function () {
    			data.instance.refresh();
    		});
    })
    .on('rename_node.jstree', function (e, data) {
        var params = util.clone(options.params);
        params.oldname = data.node.id;
        params.newname = util.dirname(params.oldname)+'/'+data.text;
        params.site = options.site;

		$.ajax(options.url+'&cmd=rename', {
		    method: 'POST',
		    dataType: 'json',
		    data: params
		})
		.done(function (d) {
		    if(!d.success){
		        prompt.alert({title:'Error', msg:d.error});
		    }else{
    		    data.instance.set_id(data.node, params.newname);
		        $('#tree').trigger('rename', params);
		    }
    	})
    	.fail(function () {
    		data.instance.refresh();
    	});

    	//$.get('/app/?cmd=rename_node', { 'id' : data.node.id, 'text' : data.text })

    })
    .on('move_node.jstree', function (e, data) {
    	prompt.confirm({
    	    title: 'Move',
    	    msg: 'Are you sure you want to move the selected files?',
    	    fn: function(btn) {
    	        switch(btn){
    	            case 'yes':
    	                doMove();
    	            break;
    	            default:
    	                refresh();
    	            break;
    	        }
    	    }
    	});

        function doMove() {
            var params = util.clone(options.params);
            params.oldname = data.node.id;
            params.newname = data.parent+'/'+util.basename(data.node.id);
            params.site = options.site;

    		$.ajax(options.url+'&cmd=rename', {
    		    method: 'POST',
    		    dataType: 'json',
    		    data: params
    		})
    		.done(function (d) {
    			//data.instance.load_node(data.parent);
    			data.instance.refresh();
    		})
    		.fail(function () {
    			data.instance.refresh();
    		});
        }
    })
    .on('copy_node.jstree', function (e, data) {
    	$.get('?operation=copy_node', { 'id' : data.original.id, 'parent' : data.parent })
    		.done(function (d) {
    			//data.instance.load_node(data.parent);
    			data.instance.refresh();
    		})
    		.fail(function () {
    			data.instance.refresh();
    		});
    }).on('keydown.jstree', '.jstree-anchor', function (e) {
        if($('.jstree-rename-input').length){
            return;
        }

        var reference = this;
        var instance = $.jstree.reference(this);
        var selected = instance.get_selected();
        var items = instance.settings.contextmenu.items(selected);
        for(var i in items){
            if (items.hasOwnProperty(i)) {
                if(items[i].shortcut === e.which) {
                    items[i].action({reference:reference});
                }

                if(items[i].submenu){
                    var submenu_items = items[i].submenu;
                    for(var j in submenu_items){
                        if(submenu_items[j].shortcut === e.which) {
                            submenu_items[j].action({reference:reference});
                        }
                    }
                }
            }
        }
    })
    .on('dblclick','a',function (e, data) {
        open({
            reference: this
        });
    })
    /*
    .on('changed.jstree', function (e, data) {
    	if(data && data.selected && data.selected.length) {
    	    var file = data.selected.join(':');
    	    tabs.open(file, options.site);
    	}
    	else {
    		$('#data .content').hide();
    		$('#data .default').html('Select a file from the tree.').show();
    	}
    })*/;

    //only select filename part on rename
    $(document).on("focus", '.jstree-rename-input', util.selectFilename);


    $('.drag')
        .on('mousedown', function (e) {
            console.log(1);
            return $.vakata.dnd.start(e, { 'jstree' : true, 'obj' : $(this), 'nodes' : [{ id : true, text: $(this).text() }] }, '<div id="jstree-dnd" class="jstree-default"><i class="jstree-icon jstree-er"></i>' + $(this).text() + '</div>');
        });
    $(document)
        .on('dnd_move.vakata', function (e, data) {
            var t = $(data.event.target);
            if(!t.closest('.jstree').length) {
                if(t.closest('.editor').length) {
                    var pos = $(data.helper).position();
                    data.helper.find('.jstree-icon').removeClass('jstree-er').addClass('jstree-ok');

                    editor = ace.edit(t.closest('.editor')[0]);
        			editor.focus();

        			//move caret with mouse
        			var coords = editor.renderer.pixelToScreenCoordinates(pos.left, pos.top-10);

        			editor.moveCursorToPosition(coords); // buggy in ace
        			/*
        			editor.selection.setSelectionRange({
        				start: coords,
        				end: coords
        			});
        			*/
                }
                else {
                    data.helper.find('.jstree-icon').removeClass('jstree-ok').addClass('jstree-er');
                }
            }
        })
        .on('dnd_stop.vakata', function (e, data) {
            var t = $(data.event.target);
            if(!t.closest('.jstree').length) {
                if(t.closest('.editor').length) {
                    //$(data.element).clone().appendTo(t.closest('.drop'));
                    // node data:
                    /*
                    console.log(data);
                    if(data.data.jstree && data.data.origin) {
                        console.log(data.data.origin.get_node(data.element));
                    }
                    */

                    editor = ace.edit(t.closest('.editor')[0]);
        			editor.focus();

                    var panel = t.closest('.ui-tabs-panel')[0];
                    var id = $(panel).attr('id');
                    var tab = $('li[aria-controls='+id+']')[0];

                    var nodes = data.data.nodes;
            		if (nodes) {
            			var node;
            			var html = '';

            			for( i=0; i<nodes.length; i++ ){
            				node = nodes[i];

            				var from = $(tab).data('file');
            				//var to = tree.getPath(node);
            				var to = node;
            				var path = '';

            				if( from ){
            				//	path = relative(dirname(from), to);
            					path = '/'+to;
            				}else{
            					path = '/'+to;
            				}

            				switch( util.fileExtension(node.toLowerCase()) ){
            					case 'jpg':
            					case 'jpeg':
            					case 'gif':
            					case 'png':
            					case 'svg':
            						html+='<img src="'+path+'" />\n';
            					break;
            					case 'css':
            						html+='<link type="text/css" rel="stylesheet" href="'+path+'">\n';
            					break;
            					case 'js':
            						html+='<script type="text/javascript" src="'+path+'"></script>\n';
            					break;
            					default:
            						var pos = editor.getCursorPosition();
            						var state = editor.getSession().getState(pos.row, pos.column);

            						if( state.substring(0,3)==='php' ){
            							html+='require("'+path+'");\n';
            						}else{
            							html+='<a href="'+path+'">'+node+'</a>\n';
            						}
            					break;
            				}
            			}

			            editor.insert(html);
            		}
                }
            }
        });


    reference = $('#tree');
    inst = $.jstree.reference(reference);
}

function refresh() {
    tree.jstree(true).refresh();
}

function setAjaxOptions(siteOptions) {
    options = siteOptions;
    tree.jstree(true).settings.core.data.url = options.url;

    //tree.jstree('create_node', '#', {'id' : 'myId', 'text' : 'My Text'}, 'last');

    refresh();
}

return {
    init: init,
    setAjaxOptions: setAjaxOptions,
    refresh: refresh,
    select: select
};

});