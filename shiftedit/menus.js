define(["jquery.menubar"], function () {
    var context;

    function build(el, menu){
        for(var i in menu) {
            if(menu[i]==='-') {
                el.append('<li>-</li>');
            }else if(menu[i]==='->') {
                el.css('display', 'flex');
                el.append('<li style="flex-grow:2"></li>');
            }else{
                var tooltip = menu[i].tooltip ? menu[i].tooltip : '';

                var item = $('<li>\
                    <a href="#'+i+'" title="'+tooltip+'">'+menu[i].text+'</a>\
                </li>').appendTo(el);

                if(menu[i].id) {
                    item.attr('id', menu[i].id);
                }

                if(menu[i].disabled) {
                    item.addClass('ui-state-disabled');
                }

                if(menu[i].name) {
                    item.attr('data-name', menu[i].name);
                }

                if(menu[i].target) {
                    item.attr('data-target', menu[i].target);
                }

                if(menu[i].match) {
                    item.attr('data-match', menu[i].match);
                }

                if(menu[i].cls) {
                    item.addClass(menu[i].cls);
                }

                if(menu[i].group) {
                    item.children('a').prepend('<input type="radio" name="'+menu[i].group+'">');
                }else if(typeof menu[i].checked === "boolean") {
                    $('<input type="checkbox">').prependTo(item.children('a')).click(function(){return false});
                }

                if(menu[i].checked) {
                    item.find('input').prop('checked', true);
                }

                //trigger the correct handler with the checkbox value
                if(menu[i].handler) {
                    item.click(
                        (function(i, item, context) {
                            return function() {
                                var checkbox = $(item).find('input');
                                checkbox.prop("checked", !checkbox.prop("checked"));

                                jQuery.proxy(menu[i].handler, item, context, checkbox.prop("checked"))();
                            };
                        }(i, item, context))
                    );
                }

                if(typeof menu[i].items === 'object'){
                    var submenu = $('<ul></ul').appendTo(item);
                    build(submenu, menu[i].items);
                }
            }
        }
    }

    function create(el, menu, contextEl){
        context = contextEl;

        build(el, menu);

        function select(event, ui) {
            console.log("Selected: " + ui.item.text());
        }
        $(el).menubar({
            autoExpand: true,
            menuIcon: true,
            buttons: false,
            //position: {
            //    within: $("#demo-frame").add(window).first()
            //},
            //select: select
        });
    }

    return {
        create: create
    };
});