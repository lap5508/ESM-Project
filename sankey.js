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
                x1 = d.target.x,
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
    function computeNodeBreadths2() {
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

    function computeNodeBreadths() {
        var remainingNodes = nodes,
            nextNodes,
            x = 0;

        while (remainingNodes.length) {
            nextNodes = [];
            remainingNodes.forEach(function(node) {
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
        scaleNodeBreadths((size[0] - nodeWidth) / (x - 1));
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
            node.x *= kx;
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



// function getData() {
//     return {
//         "nodes": [
//             {"node": 0,"name":"Promote awareness of IT Services"},
//             {"node": 1,"name":"Provide end-user training and knowledge"},
//             {"node": 2,"name":"Ensure Access to services"},
//             {"node": 3,"name":"Provide end-user help and support"},
//             {"node": 4,"name":"Contribute to effective service designs & roll outs"},
//             {"node": 5,"name":"Help ensure high quality of services provided"},
//             {"node": 6,"name":"Provide data and insights to IT & the business"},
//             {"node": 7,"name":"Project 1", "xPos": 1},
//             {"node": 8,"name":"Project 2", "xPos": 1},
//             {"node": 9,"name":"Project 3", "xPos": 1},
//             {"node": 10,"name":"Project 4", "xPos": 1},
//             {"node": 11,"name":"Project 5", "xPos": 1},
//             {"node": 12,"name":"Project 6", "xPos": 1},
//             {"node": 13,"name":"Project 7", "xPos": 1},
//             {"node": 14,"name":"Project 8", "xPos": 1},
//             {"node": 15,"name":"Project 9", "xPos": 1},
//             {"node": 16,"name":"Project 10", "xPos": 1},
//             {"node": 17,"name":"Project 11", "xPos": 1},
//             {"node": 18,"name":"Project 12", "xPos": 1},
//             {"node": 19,"name":"Project 13", "xPos": 1},
//             {"node": 20,"name":"Project 14", "xPos": 1},
//             {"node": 21,"name":"Incidents can be linked to projects to ensure we solve the right problems"},
//             {"node": 22,"name":"End-users can identify and locate the services and support they need"},
//             {"node": 23,"name":"End-users are more likely to adopt & utilize IT services"},
//             {"node": 24,"name":"IT is more reliable"},
//             {"node": 25,"name":"End-users know how to leverage technology to improve performance"},
//             {"node": 26,"name":"Reduced duplication of effort & use of shadow IT across the org"},
//             {"node": 27,"name":"Greater Organizational capacity for innovation"},
//             {"node": 28,"name":"End-users get help quickly so they can get back to work"},
//             {"node": 29,"name":"Cost-savings"},
//             {"node": 30,"name":"Users have a positive experience with IT services throughout the service lifecycle"},
//             {"node": 31,"name":"Higher quality of teaching, learning, and research"}
//         ],
//         "links": [
//             {"source":0,
//                 "target":14,
//                 "value":6},
//             {"source":0,
//                 "target":22,
//                 "value":6},
//             {"source":0,
//                 "target":23,
//                 "value":1},
//             {"source":1,
//                 "target":8,
//                 "value":2},
//             {"source":1,
//                 "target":23,
//                 "value":1},
//             {"source":1,
//                 "target":25,
//                 "value":6},
//             {"source":1,
//                 "target":31,
//                 "value":1},
//             {"source":2,
//                 "target":23,
//                 "value":1},
//             {"source":2,
//                 "target":31,
//                 "value":1},
//             {"source":2,
//                 "target":18,
//                 "value":6},
//             {"source":3,
//                 "target":21,
//                 "value":6},
//             {"source":3,
//                 "target":23,
//                 "value":1},
//             {"source":3,
//                 "target":28,
//                 "value":6},
//             {"source":3,
//                 "target":17,
//                 "value":6},
//             {"source":3,
//                 "target":30,
//                 "value":3},
//             {"source":4,
//                 "target":7,
//                 "value":6},
//             {"source":4,
//                 "target":8,
//                 "value":2},
//             {"source":4,
//                 "target":9,
//                 "value":6},
//             {"source":4,
//                 "target":10,
//                 "value":6},
//             {"source":4,
//                 "target":11,
//                 "value":6},
//             {"source":4,
//                 "value":6},
//             {"source":4,
//                 "target":13,
//                 "value":6},
//             {"source":4,
//                 "target":26,
//                 "value":6},
//             {"source":4,
//                 "target":31,
//                 "value":1},
//             {"source":4,
//                 "target":30,
//                 "value":3},
//             {"source":5,
//                 "target":27,
//                 "value":6},
//             {"source":5,
//                 "target":31,
//                 "value":1},
//             {"source":5,
//                 "target":29,
//                 "value":6},
//             {"source":5,
//                 "target":19,
//                 "value":5},
//             {"source":5,
//                 "target":15,
//                 "value":6},
//             {"source":5,
//                 "target":8,
//                 "value":2},
//             {"source":6,
//                 "target":16,
//                 "value":6},
//             {"source":6,
//                 "target":20,
//                 "value":6},
//             {"source":6,
//                 "target":24,
//                 "value":6},
//             {"source":6,
//                 "target":31,
//                 "value":1}
//         ]};
// }
//
// var margin = {top: 1, right: 1, bottom: 6, left: 1},
//     width = 960 - margin.left - margin.right,
//     height = 500 - margin.top - margin.bottom;
//
// var formatNumber = d3.format(",.0f"),
//     format = function(d) { return formatNumber(d) + " TWh"; },
//     color = d3.scale.category20();
//
// var svg = d3.select("#chart").append("svg")
//     .attr("width", width + margin.left + margin.right)
//     .attr("height", height + margin.top + margin.bottom)
//     .append("g")
//     .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
//
// var sankey = d3.sankey()
//     .nodeWidth(15)
//     .nodePadding(10)
//     .size([width, height]);
//
// var path = sankey.link();
//
// var renderSankey = function(energy) {
//
//
//     window.width = 500;
//     sankey
//         .nodes(energy.nodes)
//         .links(energy.links)
//         .layout(32);
//
//     var link = svg.append("g").selectAll(".link")
//         .data(energy.links)
//         .enter().append("path")
//         .attr("class", "link")
//         .attr("d", path)
//         .style("stroke-width", function(d) { return Math.max(1, d.dy); })
//         .sort(function(a, b) { return b.dy - a.dy; });
//
//     link.append("title")
//         .text(function(d) { return d.source.name + " → " + d.target.name + "\n" + format(d.value); });
//
//     var node = svg.append("g").selectAll(".node")
//         .data(energy.nodes)
//         .enter().append("g")
//         .attr("class", "node")
//         .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
//         .call(d3.behavior.drag()
//             .origin(function(d) { return d; })
//             .on("dragstart", function() { this.parentNode.appendChild(this); })
//             .on("drag", dragmove));
//
//     node.append("rect")
//         .attr("height", function(d) { return d.dy; })
//         .attr("width", sankey.nodeWidth())
//         .style("fill", function(d) { return d.color = color(d.name.replace(/ .*/, "")); })
//         .style("stroke", function(d) { return d3.rgb(d.color).darker(2); })
//         .append("title")
//         .text(function(d) { return d.name + "\n" + format(d.value); });
//
//     node.append("text")
//         .attr("x", -6)
//         .attr("y", function(d) { return d.dy / 2; })
//         .attr("dy", ".35em")
//         .attr("text-anchor", "end")
//         .attr("transform", null)
//         .text(function(d) { return d.name; })
//         .filter(function(d) { return d.x < width / 2; })
//         .attr("x", 6 + sankey.nodeWidth())
//         .attr("text-anchor", "start");
//
//     function dragmove(d) {
//         d3.select(this).attr("transform", "translate(" + d.x + "," + (d.y = Math.max(0, Math.min(height - d.dy, d3.event.y))) + ")");
//         sankey.relayout();
//         link.attr("d", path);
//     }
// }

//renderSankey(getData());




