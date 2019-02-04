var nodes = new vis.DataSet();
var edges = new vis.DataSet();
var container = document.getElementById('visjsgraph');

var options = {
    height: '1200px',
    //width: '1200px',
    // default node style
    nodes: {
        shape: 'image',
        brokenImage: TOPOLOGY_IMG_DIR + 'role-unknown.png',
        size: 35,
        font: { 
            multi: 'md',
            face: 'helvetica',
        }, 
    },
    // default edge style
    edges: {
        length: 100,
        width: 2,
        font: {
            face: 'helvetica',
        },
    },
    physics: {
        solver: 'forceAtlas2Based' //best solver fot network diagrams
    }
    

};

var topology = new vis.Network(container, {nodes: nodes, edges: edges}, options);

topology.on("dragEnd", function (params){
    dragged = this.getPositions(params.nodes);
    $.each(dragged, function(node_id, coordinates){
        if (CHANGE_DEVICE_ALLOWED) {
            api_call('/api/dcim/devices/'+node_id+'/', 'PATCH', {custom_fields: {coordinates: coordinates.x+';'+coordinates.y}});
        }
        nodes.update({ id: node_id, physics: false });
    });
});

// load configuration
api_call("/static/js/topology_config.json", "GET", undefined, function(config) {
    var hidden_roles = config.hidden_roles;
    // Load up only cables that need to be shown
    var shown_cables = config.shown_cables;
    // load devices
    api_call("/api/dcim/devices/?limit=0&site="+SITE_SLUG, "GET", undefined, function(response) {
       $.each(response.results, function(index, device) {
           if (hidden_roles.includes(device.device_role.slug)) {
               //console.log(device.name+' has been hidden because of its role '+device.device_role.slug);
               return undefined;
           }
           var node = {
               id: device.id, 
               name: device.name,
               label: '*'+device.name+'*\n'+device.device_type.model, 
               image: TOPOLOGY_IMG_DIR + device.device_role.slug+'.png',
               title: device.device_role.name+'<br>'
                   +device.name+'<br>'
                   +device.device_type.manufacturer.name+' '+device.device_type.model+'<br>'
                   +'SN: '+device.serial,
           }
           if (device.custom_fields.coordinates){
                var coordinates = device.custom_fields.coordinates.split(";");
                node.x = parseInt(coordinates[0]);
                node.y = parseInt(coordinates[1]);
                node.physics = false;
            }
            nodes.add(node);
        });
       // once all nodes a loaded fit them to viewport
       topology.fit();
    });
    // load cables
    api_call("/api/dcim/cables/?limit=0&site="+SITE_SLUG, "GET", undefined, function(response){
        $.each(response.results, function(index, cable) {
            
            if (shown_cables.includes(cable.type)) {              
                // Set display color to same color as cable in netbox
                if (cable.color) {
                    var color = '#'+cable.color;
                } else {
                    var color = '#000000';
                }
    
                edges.add({
                    id: cable.id,
                    from: cable.termination_a.device.id, 
                    to: cable.termination_b.device.id, 
                    dashes: !cable.status.value,
                    color: {color: color, highlight: color, hover: color},
                    title: 'Connection between<br>'
                        +cable.termination_a.device.display_name+' ['+cable.termination_a.name+']<br>'
                        +cable.termination_b.device.display_name+' ['+cable.termination_b.name+']',
                });
            } else {
                //console.log(cable.id+' has been hidden because of its type '+cable.type);
                return undefined;
            }
        });
        topology.fit();
     });
});

function setVisible(selector, visible) {
    document.querySelector(selector).style.display = visible ? 'block' : 'none';
}
function api_call(url, method, data, callback){
    $.ajax({
        url: BASEURL + url,
        headers: {"X-CSRFToken": TOKEN},
        dataType: 'json',
        contentType: 'application/json',
        method: method || "GET",
        data: JSON.stringify(data),
        success: callback,
    }).fail(function(response){
        console.log(response);
    });
}

function populate_interfaces(device_tag, device_id) {
    api_call('/api/dcim/interfaces/?limit=0&device_id='+device_id, "GET", undefined, function(response, status) {
        $('#'+device_tag+'_interfaces').html('');
        $.each(response.results.filter(function(interface){return interface.device.id == device_id}), function(index, interface){
            // ignore virtual interfaces
            if (interface.form_factor.value < 800) return;
            $('#'+device_tag+'_interfaces').append($('<option>', {
                value: interface.id,
                text: interface.name + (interface.interface_connection ? ' ['+interface.interface_connection.interface.device.name+']' : ''),
                form_factor: interface.form_factor.value,
                disabled: interface.interface_connection ? true : false,
            }));
        });
        $('#'+device_tag+'_label').text(nodes.get(device_id).name);
    });
}
