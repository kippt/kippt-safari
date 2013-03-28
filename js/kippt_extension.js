jQuery(function() {
  var Kippt = {
    popover: {},
    clip: {},
    existingClip: {},
    user: {}
  };
  
  // Load user data from cache
  if (localStorage.getItem("kipptUserId")) {
    Kippt.user.id = +localStorage.getItem("kipptUserId");
  }

  Kippt.popover.close = function() {
    setTimeout(function() {
      safari.extension.popovers[0].hide();
    }, 0);
  };

  Kippt.popover.openTab = function(url) {
    safari.application.activeBrowserWindow.openTab().url = url;
    Kippt.popover.close();
  };

  Kippt.popover.updateLists = function(data) {
    $("#id_list").html("");

    $.each(data, function(i, list) {
      var title,
          selectedListElement;
      
      // Add user to title if not the current user
      if (Kippt.user.id && Kippt.user.id !== list.user.id) {
        title = list.title + " (" + list.user.username + ")";
      }
      else {
        title = list.title;
      }
      
      $("#id_list").append(new Option(title, list.id, true, true));
    });

    if (Kippt.clip.selectedList) {
      selectedListElement = $("#id_list option[value='"+Kippt.clip.selectedList+"']");
    }
    else {
      selectedListElement = $("#id_list option").first();
    }

    $("#id_list option").removeAttr("selected");
    selectedListElement.attr("selected", "selected");

    $("#id_list").append("<option id='new-list-toggle'>-- New list --</option>");
  };
  
  Kippt.popover.clearUI = function() {
    Kippt.previousUrl = false;
    $("#id_title").val("");
    $("#id_notes").val("");
    $("#id_is_read_later").removeAttr("checked");
    $("#id_list").show();
    $("#new_list").hide();
    $("#id_new_list").val("");
    $("#id_private").removeAttr("checked");
  };
  
  Kippt.popover.saveClip = function(msg) {
    var type;
    if (!msg.id) {
      // Create new
      type = "POST";
      url = "https://kippt.com/api/clips/";
    } else {
      // Update
      type = "PUT";
      url = "https://kippt.com/api/clips/"+msg.id+"/";
    }

    var request = $.ajax({
      url: url,
      type: type,
      dataType: "json",
      data: JSON.stringify(msg)
    })
    .done(function(){
      // Clear page cache
      Kippt.popover.clearUI();
      localStorage.removeItem("cache-title");
      localStorage.removeItem("cache-notes");
    })
    .fail(function(jqXHR, textStatus){
      alert( "Something went wrong when saving. Try again or contact hello@kippt.com");
    });
  };

  Kippt.popover.spinnerOptions = {
    lines: 9,
    length: 2,
    width: 2,
    radius: 3,
    rotate: 0,
    color: "#111",
    speed: 1,
    trail: 27,
    shadow: false,
    hwaccel: false,
    className: "spinner",
    zIndex: 2e9,
    top: "auto",
    left: "auto"
  };

  Kippt.popover.spinner = new Spinner(Kippt.popover.spinnerOptions).spin();

  Kippt.popover.handler = function() {
    var tab = safari.application.activeBrowserWindow.activeTab;
    Kippt.url = tab.url;

    // Open Kippt"s Inbox if it"s an empty page
    if (!tab.url) {
      tab.url = "https://kippt.com/inbox";
      Kippt.popover.close();
      return;
    }

    // Clear fields if not on the same page anymore
    if (tab.url !== Kippt.previousUrl) {
      $("#id_title").val(tab.title.trim());
      Kippt.clip.updateExisting = false;
      Kippt.previousUrl = tab.url;
      Kippt.existingClip = {};
      delete Kippt.clip.selectedList;
      $(".existing a").hide();
      $(".existing").show();
      $(".existing .loading").html($(Kippt.popover.spinner.el).clone());
    }

    // Authentication check and connected services
    $.getJSON("https://kippt.com/api/account/?include_data=services&disable_basic_auth=1")
    .done(function(data) {
      Kippt.profilePath = data.app_url;
      Kippt.user.id = data.id;
      localStorage.setItem("kipptUserId", data.id);

      $.each(data.services, function(name, connected) {
        if (connected) {
          $("#kippt-actions ." + name).toggleClass("connected", connected);
          $("#kippt-actions ." + name).css("display", "inline-block");
        }
      });
    })
    .fail(function() {
      Kippt.popover.openTab("https://kippt.com/login/");
    });

    // Check for existing clip
    $.getJSON("https://kippt.com/api/clips/?include_data=list&url=" + escape(tab.url))
    .done(function(data) {
      $(".existing .loading").html("");
      if (data.meta.total_count > 0) {
        Kippt.existingClip = data.objects[0];
        $(".existing a").css("display", "inline-block");
      }
    });

    // Populate lists from local storage
    var listCache = localStorage.getItem("kipptListCache");
    if (listCache) {
      Kippt.popover.updateLists(JSON.parse(localStorage.getItem("kipptListCache")));
    }

    // Fetch latest lists
    $.getJSON("https://kippt.com/api/lists/?limit=0&include_data=user")
    .done(function(data) {
      var lists = data.objects,
          listJSON = JSON.stringify(lists);

      if (listJSON !== listCache) {
        Kippt.popover.updateLists(lists);
        localStorage.setItem("kipptListCache", listJSON);
      }
    });
  };

  // Edit existing clip
  $(document).on("click", ".existing a", function(event) {
    event.preventDefault();
    Kippt.popover.clearUI();
    Kippt.clip.updateExisting = true;
    Kippt.clip.selectedList = Kippt.existingClip.list.id;
    $("#id_title").val(Kippt.existingClip.title);
    $("#id_notes").val(Kippt.existingClip.notes);
    $("#id_list option[value="+Kippt.existingClip.list.id+"]").attr("selected", "selected");
    $(".existing").hide();
  });

  // Save clip
  $(document).on("click", "#submit_clip", function() {
    var services = $.map($(".share:checked"), function(element) {
      return $(element).data("service");
    });

    var data = {
      url: Kippt.url,
      title: $("#id_title").val(),
      notes: $("#id_notes").val(),
      list: $("#id_list option:selected").val(),
      source: "safari_v1.0",
      share: services
    };
    
    
    // Read later
    if ($('#id_is_read_later').is(':checked'))
        data.is_read_later = true;
    
    
    if (Kippt.clip.updateExisting) {
      data.id = Kippt.existingClip.id;
    }

    // New list
    if ($("#id_new_list").val()) {
      data.new_list = {};
      data.new_list.title = $("#id_new_list").val();
      if ($("#id_private").is(":checked")) {
        data.new_list.is_private = true;
      }
      else {
        data.new_list.is_private = false;
      }
    }
    
    if (data.new_list) {
      $.ajax({
        url: "https://kippt.com/api/lists/",
        type: "POST",
        dataType: "json",
        data: JSON.stringify(data.new_list)
      })
      .done(function(response) {
        // Create clip with new list
        data.list = response.id;
        Kippt.popover.saveClip(data);
      })
      .fail(function() {
        alert( "Something went wrong when saving. Try again or contact hello@kippt.com");
      });
    } else {
      // Create clip with existing list
      Kippt.popover.saveClip(data);
    }
    
    Kippt.popover.close();
  });

  // Connect a service to share
  $(document).on("click", "#kippt-actions > div:not(.connected)", function() {
    Kippt.popover.openTab("https://kippt.com/accounts/settings/connections/");
    Kippt.popover.close();
  });

  // Open profile page
  $(document).on("click", "#open-profile", function() {
    if (Kippt.profilePath !== undefined) {
      Kippt.popover.openTab("https://kippt.com" + Kippt.profilePath);
    } else {
      Kippt.popover.openTab("https://kippt.com/profile/");
    }
  });

  // Open feed page
  $(document).on("click", "#open-kippt", function() {
    Kippt.popover.openTab("https://kippt.com/");
  });
  
  // Open inbox page
  $(document).on("click", "#open-inbox", function() {
    Kippt.popover.openTab("https://kippt.com/inbox/");
  });

  $("#id_list").on("change", function(event) {
    if ($(this).children("option#new-list-toggle:selected").length) {
      $("#id_list").hide();
      $("#new_list").css("display", "inline-block");
      $("#id_new_list").focus();
    }
    else {
      Kippt.clip.selectedList = $("#id_list option:selected").val();
    }
  });

  // Configure share tooltips
  $("#kippt-actions > div").tipsy({
    gravity: "sw",
    title: function() {
      var el = $(this);
      if (el.hasClass("connected")) {
        return "Share on " + el.attr("data-service-name");
      }
      else {
        return "Click to connect with " + el.attr("data-service-name");
      }
    }
  });

  safari.application.addEventListener("popover", Kippt.popover.handler, true);
});
