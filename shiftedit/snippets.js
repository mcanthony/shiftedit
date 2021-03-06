define(['app/tabs', 'app/util', 'app/prompt', 'app/loading', 'app/shortcuts', 'app/lang', 'jstreegrid'], function (tabs, util, prompt, loading, shortcuts) {
var lang = require('app/lang').lang;
var confirmed = false;

function refresh() {
    tree.jstree(true).refresh();
}

function edit(node) {
    //snippet dialog
    $( "body" ).append('<div id="dialog-snippet" title="Edit snippet">\
      <form id="snippetForm" class="hbox">\
        <p>\
            <label>Name</label>\
            <input type="text" name="text" required>\
        </p>\
        <p>\
            <label>Insert type</label>\
            <span id="wrapRadio">\
                <input type="radio" id="radio1" name="wrap" value="1" checked><label for="radio1">Wrap selection</label>\
                <input type="radio" id="radio2" name="wrap" value="0"><label for="radio2">Insert block</label>\
            </span>\
        </p>\
        <span>Insert before</span>\
        <p>\
            <textarea name="snippet1" class="flex"></textarea>\
        </p>\
        <div id="snippet2Container">\
            <span>Insert after</span>\
            <p>\
                <textarea name="snippet2" class="flex"></textarea>\
            </p>\
        </div>\
        <p>\
            <label>Shortcut, ctrl + shift + &nbsp;</label>\
            <select name="shortcut">\
                <option value=""></option>\
                <option value="96">0</option>\
                <option value="49">1</option>\
                <option value="50">2</option>\
                <option value="51">3</option>\
                <option value="52">4</option>\
                <option value="53">5</option>\
                <option value="54">6</option>\
                <option value="55">7</option>\
                <option value="56">8</option>\
                <option value="57">9</option>\
            </select>\
        </p>\
      </form>\
    </div>');

    function toggleWrap() {
        var wrap = $('input[name=wrap]:checked').val();

        if(wrap==1) {
            $('#snippet2Container').show();
        } else {
            $('#snippet2Container').hide();
        }
    }

    //set values
    if(node) {
        node.data.text = node.text;
        for(var i in node.data) {
    		if (node.data.hasOwnProperty(i)) {
    		    var field = $('[name='+i+']');
    		    switch(field.attr('type')){
    		        case 'radio':
    		            if (node.data[i])
    		                $("input[name="+i+"][value=" + node.data[i] + "]").prop('checked', true);
    	            break;
    	            default:
                        field.val(node.data[i]);
                    break;
    		    }
    		}
        }
    }

    $( "#wrapRadio" ).buttonset();

    //toggle fields
    $('#wrapRadio label').click(function(){
        $(this).prev().prop('checked', true).val(); //make sure radio is checked
        toggleWrap();
    });

    toggleWrap();

    //open dialog
    var dialog = $( "#dialog-snippet" ).dialog({
        modal: true,
        width: 500,
        height: 520,
        close: function( event, ui ) {
            $( this ).remove();
        },
        buttons: {
            Save: function() {
                $( "#dialog-snippet" ).dialog( "close" );
                $( "#dialog-snippet" ).remove();

                var params = util.serializeObject($('#snippetForm'));

                //save and create node
                loading.fetch('/api/snippets?cmd=edit', {
                    action: 'Saving snippet',
                    data: params,
                    success: function(data) {
                        refresh();
                        shortcuts.load();
                    }
                });
            }
        }
    });
}

    tree = $('#snippets')
    .jstree({
    	'core' : {
            'data' : function (node, callback) {
                //console.log(node);

        		$.ajax('/api/snippets?cmd=list&path='+encodeURIComponent(node.id), {
        		    method: 'POST',
        		    dataType: 'json',
        		    //data: options.params,
        		    success: function(data) {
                        callback.call(tree, data.snippets);
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
                    	    msg: 'Are you sure you want to delete the selected snippet?',
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
    			}

    			return true;
    		}
    	},
    	'sort' : function(a, b) {
    		return this.get_type(a) === this.get_type(b) ? (this.get_text(a).toLowerCase() > this.get_text(b).toLowerCase() ? 1 : -1) : (this.get_type(a) >= this.get_type(b) ? 1 : -1);
    	},
    	'contextmenu' : {
    		'items' : function(node) {
    			//var tmp = $.jstree.defaults.contextmenu.items();

    			var tmp = {
                    "newSnippet": {
                        "label": lang.newSnippetText,
    					"icon" : "glyphicon glyphicon-leaf",
    					"action" : function (data) {
    						edit();
    					}
                    },
                    "newFolder": {
                        "label": lang.newFolderText,
    					"icon" : "glyphicon glyphicon-leaf",
    					"action" : function (data) {
                        	var inst = $.jstree.reference(data.reference),
                        		node = inst.get_node(data.reference);
                        		var parent = node.type == 'default' ? node : inst.get_node(node.parent);
                        	inst.create_node(parent, { type : "default" }, "last", function (new_node) {
                        		setTimeout(function () { inst.edit(new_node); }, 0);
                        	});
    					}
                    },
                    "edit": {
                        "label": lang.editText,
    					"icon" : "glyphicon glyphicon-leaf",
    					"action" : function (data) {
    						var inst = $.jstree.reference(data.reference),
    							node = inst.get_node(data.reference);
    						edit(node);
    					}
                    },
                    "rename": {
                        "label": lang.renameText,
    					"icon" : "glyphicon glyphicon-leaf",
    					"action" : function (data) {
    						var inst = $.jstree.reference(data.reference),
    							node = inst.get_node(data.reference);
    						inst.edit(node);
    					}
                    },
                    "delete": {
                        "label": lang.deleteText,
    					"icon" : "glyphicon glyphicon-leaf",
    					"action" : function (data) {
    						var inst = $.jstree.reference(data.reference),
    							obj = inst.get_node(data.reference);
    						if(inst.is_selected(obj)) {
    							inst.delete_node(inst.get_selected());
    						} else {
    							inst.delete_node(obj);
    						}
    					}
                    },
					"reload": {
						"label" : "Reload",
						action: refresh
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

		$.ajax('/api/snippets?cmd=delete&id='+data.node.id, {
		    dataType: 'json',
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
    	$.get('/api/snippets?cmd=new', { 'type' : data.node.type, 'parent' : data.node.parent, 'text' : data.node.text })
    		.done(function (d) {
    			data.instance.set_id(data.node, d.id);
    		})
    		.fail(function () {
    			data.instance.refresh();
    		});
    })
    .on('rename_node.jstree', function (e, data) {
        var params = {};
        params.id = data.node.id;
        params.name = data.text;

		$.ajax('/api/snippets?cmd=rename', {
		    method: 'POST',
		    dataType: 'json',
		    data: params
		})
		.done(function (d) {
		    if(!d.success){
		        prompt.alert({title:'Error', msg:d.error});
		    }else{
    		    data.instance.set_id(data.node, params.name);
		        tree.trigger('rename', params);
		    }
    	})
    	.fail(function () {
    		data.instance.refresh();
    	});

    	//$.get('/app/?cmd=rename_node', { 'id' : data.node.id, 'text' : data.text })

    })
    .on('dblclick','a',function (e, data) {
    	var inst = $.jstree.reference(this);
        var node = inst.get_node(this);
        var editor = tabs.getEditor(tabs.active());
        var item = node.data;

        if (editor) {
            if(parseInt(item.wrap)) {
	            editor.commands.exec('wrapSelection', editor, [item.snippet1, item.snippet2]);
            } else {
	            editor.insert(item.snippet1);
            }
        }
    });

    return {
    };
});