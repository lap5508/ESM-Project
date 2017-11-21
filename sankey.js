//////////////////////// sankey.js /////////////////////////


d3.sankey = function() {
    var sankey = {},
        nodeWidth = 24,
        nodePadding = 8,
        size = [1, 1],
        nodes = [],
        links = [];

    sankey.nodeWidth = function(_) {
        if (!arguments.length) return nodeWidth;
        nodeWidth = +_;
        return sankey;
    };

    sankey.nodePadding = function(_) {
        if (!arguments.length) return nodePadding;
        nodePadding = +_;
        return sankey;
    };

    sankey.nodes = function(_) {
        if (!arguments.length) return nodes;
        nodes = _;
        return sankey;
    };

    sankey.links = function(_) {
        if (!arguments.length) return links;
        links = _;
        return sankey;
    };

    sankey.size = function(_) {
        if (!arguments.length) return size;
        size = _;
        return sankey;
    };

    sankey.layout = function(iterations) {
        computeNodeLinks();
        computeNodeValues();
        computeNodeBreadths();
        computeNodeDepths(iterations);
        computeLinkDepths();
        return sankey;
    };

    sankey.relayout = function() {
        computeLinkDepths();
        return sankey;
    };

    sankey.link = function() {
        var curvature = .5;

        function link(d) {
            var x0 = d.source.x + d.source.dx,
                x1 = d.target.x ,
                xi = d3.interpolateNumber(x0, x1),
                x2 = xi(curvature),
                x3 = xi(1 - curvature),
                y0 = d.source.y + d.sy + d.dy / 2,
                y1 = d.target.y + d.ty + d.dy / 2;
            return "M" + x0 + "," + y0
                + "C" + x2 + "," + y0
                + " " + x3 + "," + y1
                + " " + x1 + "," + y1;
        }

        link.curvature = function(_) {
            if (!arguments.length) return curvature;
            curvature = +_;
            return link;
        };

        return link;
    };

    // Populate the sourceLinks and targetLinks for each node.
    // Also, if the source and target are not objects, assume they are indices.
    function computeNodeLinks() {
        nodes.forEach(function(node) {
            node.sourceLinks = [];
            node.targetLinks = [];
        });
        links.forEach(function(link) {
            var source = link.source,
                target = link.target;
            if (typeof source === "number") source = link.source = nodes[link.source];
            if (typeof target === "number") target = link.target = nodes[link.target];
            source.sourceLinks.push(link);
            target.targetLinks.push(link);
        });
    }

    // Compute the value (size) of each node by summing the associated links.
    function computeNodeValues() {
        nodes.forEach(function(node) {
            node.value = Math.max(
                d3.sum(node.sourceLinks, value),
                d3.sum(node.targetLinks, value)
            );
        });
    }

    // Iteratively assign the breadth (x-position) for each node.
    // Nodes are assigned the maximum breadth of incoming neighbors plus one;
    // nodes with no incoming links are assigned breadth zero, while
    // nodes with no outgoing links are assigned the maximum breadth.
    function computeNodeBreadths() {
        var remainingNodes = nodes,
            nextNodes,
            x = 0;

        while (remainingNodes.length) {
            nextNodes = [];
            remainingNodes.forEach(function(node) {

                if (node.xPos)
                    node.x = node.xPos;
                else
                    node.x = x;

                node.dx = nodeWidth;
                node.sourceLinks.forEach(function(link) {
                    nextNodes.push(link.target);
                });
            });
            remainingNodes = nextNodes;
            ++x;
        }

        //
        moveSinksRight(x);
        scaleNodeBreadths((width - nodeWidth) / (x - 1));
    }

    function moveSourcesRight() {
        nodes.forEach(function(node) {
            if (!node.targetLinks.length) {
                node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
            }
        });
    }

    function moveSinksRight(x) {
        nodes.forEach(function(node) {
            if (!node.sourceLinks.length) {
                node.x = x - 1;
            }
        });
    }

    function scaleNodeBreadths(kx) {
        nodes.forEach(function(node) {
            // node.x *= kx;
            //the + 250 is how you change the x placement of the nodes
            node.x *= kx + (width - 200);
            console.log("kx: " + kx);
        });
    }

    function computeNodeDepths(iterations) {
        var nodesByBreadth = d3.nest()
            .key(function(d) { return d.x; })
            .sortKeys(d3.ascending)
            .entries(nodes)
            .map(function(d) { return d.values; });

        //
        initializeNodeDepth();
        resolveCollisions();
        for (var alpha = 1; iterations > 0; --iterations) {
            relaxRightToLeft(alpha *= .99);
            resolveCollisions();
            relaxLeftToRight(alpha);
            resolveCollisions();
        }

        function initializeNodeDepth() {
            var ky = d3.min(nodesByBreadth, function(nodes) {
                return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
            });

            nodesByBreadth.forEach(function(nodes) {
                nodes.forEach(function(node, i) {
                    node.y = i;
                    node.dy = node.value * ky;
                });
            });

            links.forEach(function(link) {
                link.dy = link.value * ky;
            });
        }

        function relaxLeftToRight(alpha) {
            nodesByBreadth.forEach(function(nodes, breadth) {
                nodes.forEach(function(node) {
                    if (node.targetLinks.length) {
                        var y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedSource(link) {
                return center(link.source) * link.value;
            }
        }

        function relaxRightToLeft(alpha) {
            nodesByBreadth.slice().reverse().forEach(function(nodes) {
                nodes.forEach(function(node) {
                    if (node.sourceLinks.length) {
                        var y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedTarget(link) {
                return center(link.target) * link.value;
            }
        }

        function resolveCollisions() {
            nodesByBreadth.forEach(function(nodes) {
                var node,
                    dy,
                    y0 = 0,
                    n = nodes.length,
                    i;

                // Push any overlapping nodes down.
                nodes.sort(ascendingDepth);
                for (i = 0; i < n; ++i) {
                    node = nodes[i];
                    dy = y0 - node.y;
                    if (dy > 0) node.y += dy;
                    y0 = node.y + node.dy + nodePadding;
                }

                // If the bottommost node goes outside the bounds, push it back up.
                dy = y0 - nodePadding - size[1];
                if (dy > 0) {
                    y0 = node.y -= dy;

                    // Push any overlapping nodes back up.
                    for (i = n - 2; i >= 0; --i) {
                        node = nodes[i];
                        dy = node.y + node.dy + nodePadding - y0;
                        if (dy > 0) node.y -= dy;
                        y0 = node.y;
                    }
                }
            });
        }

        function ascendingDepth(a, b) {
            return a.y - b.y;
        }
    }

    function computeLinkDepths() {
        nodes.forEach(function(node) {
            node.sourceLinks.sort(ascendingTargetDepth);
            node.targetLinks.sort(ascendingSourceDepth);
        });
        nodes.forEach(function(node) {
            var sy = 0, ty = 0;
            node.sourceLinks.forEach(function(link) {
                link.sy = sy;
                sy += link.dy;
            });
            node.targetLinks.forEach(function(link) {
                link.ty = ty;
                ty += link.dy;
            });
        });

        function ascendingSourceDepth(a, b) {
            return a.source.y - b.source.y;
        }

        function ascendingTargetDepth(a, b) {
            return a.target.y - b.target.y;
        }
    }

    function center(node) {
        return node.y + node.dy / 2;
    }

    function value(link) {
        return link.value;
    }

    return sankey;
};


///////////////////////////////////////////



function getData() {
    return {
        "nodes": [{
            "node": 0,
            "name": "Promote awareness of IT Services",
            "color": "#58cb84",
            "xPos": 1
        }, {
            "node": 1,
            "name": "Provide end-user training and knowledge",
            "color": "#58cb84",
            "xPos": 1
        }, {
            "node": 2,
            "name": "Ensure Access to services",
            "color": "#58cb84",
            "xPos": 1
        }, {
            "node": 3,
            "name": "Provide end-user help and support",
            "color": "#58cb84",
            "xPos": 1
        }, {
            "node": 4,
            "name":"Contribute to effective service designs & roll outs",
            "color": "#58cb84",
            "xPos": 1
        }, {
            "node": 5,
            "name": "Help ensure high quality of services provided",
            "color": "#58cb84",
            "xPos": 1
        }, {
            "node": 6,
            "name": "Provide data and insights to IT & the business",
            "color": "#58cb84",
            "xPos": 1
        }, {
            "node": 7,
            "color": "#82b2cb",
            "name": "Project 1"
        }, {
            "node": 8,
            "color": "#82b2cb",
            "name": "Project 2"
        }, {
            "node": 9,
            "color": "#82b2cb",
            "name": "Project 3"
        }, {
            "node": 10,
            "color": "#82b2cb",
            "name": "Project 4"
        }, {
            "node": 11,
            "color": "#82b2cb",
            "name":"Project 5"
        }, {
            "node": 12,
            "color": "#82b2cb",
            "name": "Project 6"
        }, {
            "node": 13,
            "color": "#82b2cb",
            "name": "Project 7"
        },  {
            "node": 14,
            "color": "#82b2cb",
            "name": "Project 8"
        }, {
            "node": 15,
            "color": "#82b2cb",
            "name": "Project 9"
        }, {
            "node": 16,
            "color": "#82b2cb",
            "name": "Project 10"
        }, {
            "node": 17,
            "color": "#82b2cb",
            "name": "Project 11"
        }, {
            "node": 18,
            "color": "#82b2cb",
            "name":"Project 12"
        }, {
            "node": 19,
            "color": "#82b2cb",
            "name": "Project 13"
        }, {
            "node": 20,
            "color": "#82b2cb",
            "name": "Project 14"
        }, {
            "node": 21,
            "color": "#a69e00",
            "name": "Incidents can be linked to projects to ensure we solve the right problems"
        }, {
            "node": 22,
            "color": "#a69e00",
            "name": "End-users can identify and locate the services and support they need"
        }, {
            "node": 23,
            "color": "#a69e00",
            "name": "End-users are more likely to adopt & utilize IT services"
        }, {
            "node": 24,
            "color": "#a69e00",
            "name": "End-users know how to leverage technology to improve performance"
        }, {
            "node": 25,
            "color": "#a69e00",
            "name": "Reduced duplication of effort & use of shadow IT across the org"
        }, {
            "node": 26,
            "color": "#a69e00",
            "name": "Greater Organizational capacity for innovation"
        }, {
            "node": 27,
            "color": "#a69e00",
            "name": "End-users get help quickly so they can get back to work"
        }, {
            "node": 28,
            "color": "#a69e00",
            "name": "Cost-savings"
        }, {
            "node": 29,
            "color": "#a69e00",
            "name": "Users have a positive experience with IT services throughout the service lifecycle"
        }, {
            "node": 30,
            "color": "#a69e00",
            "name": "Higher quality of teaching, learning, and research"
        }, {
            "node": 31,
            "color": "#a69e00",
            "name": "IT is more reliable"
        }],
        "links": [{
            "source": 21,
            "color": "#a69e00",
            "target": 1,
            "value": 6
        }, {
            "source": 22,
            "color": "#a69e00",
            "target": 0,
            "value": 6
        }, {
            "source": 23,
            "color": "#a69e00",
            "target": 1,
            "value": 1.5
        }, {
            "source": 23,
            "color": "#a69e00",
            "target": 0,
            "value": 1.5
        }, {
            "source": 23,
            "color": "#a69e00",
            "target": 2,
            "value": 1.5
        }, {
            "source": 23,
            "color": "#a69e00",
            "target": 3,
            "value": 1.5
        }, {
            "source": 24,
            "color": "#a69e00",
            "target": 6,
            "value": 6
        }, {
            "source": 25,
            "color": "#a69e00",
            "target": 1,
            "value": 6
        }, {
            "source": 26,
            "color": "#a69e00",
            "target": 4,
            "value": 2
        }, {
            "source": 27,
            "color": "#a69e00",
            "target": 5,
            "value": 6
        }, {
            "source": 28,
            "color": "#a69e00",
            "target": 3,
            "value": 6
        }, {
            "source": 29,
            "color": "#a69e00",
            "target": 5,
            "value": 6
        }, {
            "source": 30,
            "color": "#a69e00",
            "target": 3,
            "value": 3
        }, {
            "source": 30,
            "color": "#a69e00",
            "target": 4,
            "value": 2
        }, {
            "source": 31,
            "color": "#a69e00",
            "target": 1,
            "value": 1.5
        }, {
            "source": 31,
            "color": "#a69e00",
            "target": 2,
            "value": 1.5
        }, {
            "source": 31,
            "color": "#a69e00",
            "target": 4,
            "value": 2
        }, {
            "source": 31,
            "color": "#a69e00",
            "target": 5,
            "value": 1.5
        }, {
            "source": 0,
            "color": "#58cb84",
            "target": 14,
            "value": 6
        }, {
            "source": 1,
            "color": "#58cb84",
            "target": 8,
            "value": 6
        }, {
            "source": 2,
            "color": "#58cb84",
            "target": 18,
            "value": 6
        }, {
            "source": 3,
            "color": "#58cb84",
            "target": 17,
            "value": 6
        }, {
            "source": 4,
            "color": "#58cb84",
            "target": 7,
            "value": 6
        }, {
            "source": 4,
            "color": "#58cb84",
            "target": 9,
            "value": 6
        }, {
            "source": 4,
            "color": "#58cb84",
            "target": 10,
            "value": 6
        }, {
            "source": 4,
            "color": "#58cb84",
            "target": 11,
            "value": 6
        }, {
            "source": 4,
            "color": "#58cb84",
            "target": 12,
            "value": 6
        }, {
            "source": 4,
            "color": "#58cb84",
            "target": 13,
            "value": 6
        }, {
            "source": 5,
            "color": "#58cb84",
            "target": 19,
            "value": 6
        }, {
            "source": 6,
            "color": "#58cb84",
            "target": 16,
            "value": 6
        }, {
            "source": 6,
            "color": "#58cb84",
            "target": 20,
            "value": 6
        }, {
            "source": 6,
            "color": "#58cb84",
            "target": 15,
            "value": 6
        }]};
}

var margin = {top: 10, right: 10, bottom: 10, left: 550},
    width = 1200 - margin.left - margin.right,
    height = 740 - margin.top - margin.bottom;

var formatNumber = d3.format(",.0f"),
    format = function(d) { return formatNumber(d) + " TWh"; },
    color = d3.scale.category20();

var svg = d3.select("#chart").append("svg")
    .attr("width", 2400)
    .attr("height", 1800)
    .attr("class", "graph-svg-component")
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

var sankey = d3.sankey()
    .nodeWidth(15)
    .nodePadding(10)
    .size([width, height]);

var path = sankey.link();

var renderSankey = function(energy) {

    function computeIcon(d){
        var iconnum = Math.floor(Math.random() * (4 - 1)) + 1;
        console.log(iconnum);
        if(iconnum === 1){return '\uf023'; }
        else if(iconnum === 2){return '\uf129'; }
        else if(iconnum === 3){return '\uf127'; }
        else{return '\uf115'; }
    }

    var iconkey = computeIcon(getData());
     console.log(iconkey);

    window.width = 500;
    sankey
        .nodes(energy.nodes)
        .links(energy.links)
        .layout(32);

    var link = svg.append("g").selectAll(".link")
        .data(energy.links)
        .enter().append("path")
        .attr("class", "link")
        .attr("d", path)
        //Math.max(1, d.dy) --> place this in the return function below to replace the width of the links to resize automatically
        .style("stroke-width", function(d) { return Math.max(1, d.dy); })
        .style("stroke", function(d){return d.color;})//add this to return the color of link
        //.style("distance", 400)
        .sort(function(a, b) { return b.dy - a.dy; });


    link.append("title")
        .text(function(d) { return d.source.name + " → " + d.target.name + "\n" + format(d.value); });

    var node = svg.append("g").selectAll(".node")
        .data(energy.nodes)
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
        .call(d3.behavior.drag()
            .origin(function(d) { return d; })
            .on("dragstart", function() { this.parentNode.appendChild(this); })
            .on("drag", dragmove));

    node.append("rect")
        .attr("height", function(d) { return d.dy; })
        .attr("width", sankey.nodeWidth())
        .style("fill", function(d) { return d.color; })
        .style("stroke", function(d) { return d3.rgb(d.color).darker(2); })
        .append("title")
        .text(function(d) { return d.name + "\n" + format(d.value); });

    node.append("rect")
        .attr("height", function(d) { return d.dy; })
        .attr("width", sankey.nodeWidth())
        .style("fill", function(d) { return d.color;}) // modified node color
        .style("stroke", function(d) {
            return d3.rgb(d.color).darker(2); })
        .append("title")
        .text(function(d) {
            return d.name + "\n" + format(d.value); });

    node.append("text")
        .attr("x", -6)
        .attr("y", function(d) { return d.dy / 2; })
        .attr("dy", ".35em")
        .attr("text-anchor", "end")
        .attr("transform", null)
        .attr('font-family', 'FontAwesome')
        .attr("fill", "white")
        .attr('font-size', function(d) { return d.size+'em'} ).attr('font-size', function(d) { return d.size+'em'} )
        .text(function(d) {return d.name + "  " + computeIcon(getData());})
        .filter(function(d) { return d.x < width / -2; })
        .attr("x", 6 + sankey.nodeWidth())
        .attr("text-anchor", "start");


    function dragmove(d) {
        d3.select(this).attr("transform", "translate(" + d.x + "," + (d.y = Math.max(0, Math.min(height - d.dy, d3.event.y))) + ")");
        sankey.relayout();
        link.attr("d", path);
    }
}

renderSankey(getData());




